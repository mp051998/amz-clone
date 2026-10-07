import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { balanceHistory, storeBalance } from '@/lib/data/balance';
import { DataError, unwrap } from '@/lib/data/errors';
import { listGiftCardPurchases, startBalanceReload } from '@/lib/data/gift-card-purchases';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const code = async (p: PromiseLike<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};
const rpcCode = async (p: PromiseLike<{ data: unknown; error: unknown }>) => code(Promise.resolve(p).then((r) => unwrap(r as never)));

describe('reloading the balance', () => {
  let me: TestUser;
  const session = `cs_test_${crypto.randomUUID()}`;
  const confirm = (amount: number, currency: string) =>
    admin().rpc('confirm_gift_card_purchase', { p_session_id: session, p_amount_minor: amount, p_currency: currency, p_payment_intent: 'pi_test_reload' });

  beforeAll(async () => {
    me = await newUser('Reloader', { funded: false });
  });
  afterAll(async () => {
    await deleteUser(me);
  });

  it('only signed-in shoppers start a reload, in whole amounts within the store’s limits', async () => {
    expect((await anon().rpc('start_balance_reload', { p_market: 'US', p_amount_minor: 5000 })).error).not.toBeNull();
    for (const amount of [50, 5050, 200_100]) {
      expect(await rpcCode(me.db.rpc('start_balance_reload', { p_market: 'US', p_amount_minor: amount }))).toBe('invalid_input');
    }
    expect(await rpcCode(me.db.rpc('start_balance_reload', { p_market: 'XX', p_amount_minor: 5000 }))).toBe('unknown_market');

    const p = await startBalanceReload(me.db, 'US', 5000);
    expect(p).toMatchObject({ amountMinor: 5000, currency: 'USD', reload: true, recipientName: null, message: null, status: 'awaiting_payment', code: null });
    unwrap(await admin().rpc('attach_gift_card_session', { p_purchase: p.id, p_session_id: session }));
  });

  it('a reload can’t carry a recipient or a message', async () => {
    const { data } = await admin().from('gift_card_purchases').select('id').eq('stripe_session_id', session).single();
    const bad = await admin().from('gift_card_purchases').update({ recipient_name: 'Someone' }).eq('id', data!.id);
    expect(bad.error).not.toBeNull();
  });

  it('shoppers can’t confirm their own reload', async () => {
    expect(await rpcCode(me.db.rpc('confirm_gift_card_purchase', { p_session_id: session, p_amount_minor: 5000, p_currency: 'usd' }))).not.toBe('no error');
    expect(await storeBalance(me.db, 'US')).toBe(0);
  });

  it('a paid session credits the balance once, with no code, checked against the amount and currency', async () => {
    expect(await rpcCode(confirm(4999, 'usd'))).toBe('amount_mismatch');
    expect(await rpcCode(confirm(5000, 'inr'))).toBe('amount_mismatch');

    const first = unwrap(await confirm(5000, 'usd')) as { status: string; code: string | null; reload: boolean };
    expect(first).toMatchObject({ status: 'paid', code: null, reload: true });
    // the success page and the webhook may both get here
    expect(unwrap(await confirm(5000, 'usd'))).toMatchObject({ status: 'paid', code: null });

    expect(await storeBalance(me.db, 'US')).toBe(5000);
    expect(await storeBalance(me.db, 'IN')).toBe(0);
    const [entry, ...rest] = await balanceHistory(me.db, 'US');
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({ amountMinor: 5000, kind: 'reload', giftCardCode: null, orderId: null });

    const { data: purchase } = await admin().from('gift_card_purchases').select('id').eq('stripe_session_id', session).single();
    const { data: rows } = await admin().from('balance_entries').select('kind, amount_minor').eq('purchase_id', purchase!.id);
    expect(rows).toEqual([{ kind: 'reload', amount_minor: 5000 }]);

    // a paid reload is listed with the purchases (the page and the API leave it out of the gift cards)
    const [mine] = await listGiftCardPurchases(me.db, 'US');
    expect(mine).toMatchObject({ reload: true, status: 'paid', code: null, redeemed: false });
  });

  it('buying a gift card still issues a code', async () => {
    const gift = `cs_test_${crypto.randomUUID()}`;
    const p = unwrap(await me.db.rpc('start_gift_card_purchase', { p_market: 'US', p_amount_minor: 2500 })) as { id: string; reload: boolean };
    expect(p.reload).toBe(false);
    unwrap(await admin().rpc('attach_gift_card_session', { p_purchase: p.id, p_session_id: gift }));
    const paid = unwrap(await admin().rpc('confirm_gift_card_purchase', { p_session_id: gift, p_amount_minor: 2500, p_currency: 'usd' })) as { code: string | null };
    expect(paid.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{6}-[0-9A-Z]{4}$/);
    expect(await storeBalance(me.db, 'US')).toBe(5000);
  });
});
