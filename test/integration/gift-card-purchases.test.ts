import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redeemGiftCard, storeBalance } from '@/lib/data/balance';
import { DataError, unwrap } from '@/lib/data/errors';
import { listGiftCardPurchases, startGiftCardPurchase } from '@/lib/data/gift-card-purchases';
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

describe('buying gift cards', () => {
  let buyer: TestUser;
  let friend: TestUser;
  const session = `cs_test_${crypto.randomUUID()}`;
  beforeAll(async () => {
    [buyer, friend] = await Promise.all([newUser('Gift Buyer'), newUser('Lucky Friend')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(buyer), deleteUser(friend)]);
  });

  it('only signed-in shoppers start a purchase, in whole amounts within the store’s limits', async () => {
    expect((await anon().rpc('start_gift_card_purchase', { p_market: 'US', p_amount_minor: 5000 })).error).not.toBeNull();
    for (const amount of [50, 5050, 200_100]) {
      expect(await rpcCode(buyer.db.rpc('start_gift_card_purchase', { p_market: 'US', p_amount_minor: amount }))).toBe('invalid_input');
    }
    expect(await rpcCode(buyer.db.rpc('start_gift_card_purchase', { p_market: 'IN', p_amount_minor: 500 }))).toBe('invalid_input');
    expect(await rpcCode(buyer.db.rpc('start_gift_card_purchase', { p_market: 'US', p_amount_minor: 5000, p_message: 'x'.repeat(241) }))).toBe('invalid_input');

    const p = await startGiftCardPurchase(buyer.db, 'US', { amountMinor: 5000, recipientName: ' Lucky ', message: 'Enjoy!' });
    expect(p).toMatchObject({ amountMinor: 5000, currency: 'USD', recipientName: 'Lucky', message: 'Enjoy!', status: 'awaiting_payment', code: null });
    unwrap(await admin().rpc('attach_gift_card_session', { p_purchase: p.id, p_session_id: session }));
    // not listed until it's paid
    expect(await listGiftCardPurchases(buyer.db, 'US')).toEqual([]);
  });

  it('shoppers can’t confirm their own purchase or write the table', async () => {
    expect(await rpcCode(buyer.db.rpc('confirm_gift_card_purchase', { p_session_id: session, p_amount_minor: 5000, p_currency: 'usd' }))).not.toBe('no error');
    expect(await rpcCode(buyer.db.rpc('attach_gift_card_session', { p_purchase: crypto.randomUUID(), p_session_id: 'cs_x' }))).not.toBe('no error');
    await buyer.db.from('gift_card_purchases').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('stripe_session_id', session);
    const { data } = await admin().from('gift_card_purchases').select('status').eq('stripe_session_id', session).single();
    expect(data!.status).toBe('awaiting_payment');
  });

  it('a paid session issues one code, checked against the amount and currency', async () => {
    const confirm = (amount: number, currency: string) =>
      admin().rpc('confirm_gift_card_purchase', { p_session_id: session, p_amount_minor: amount, p_currency: currency, p_payment_intent: 'pi_test_1' });
    expect(await rpcCode(confirm(4999, 'usd'))).toBe('amount_mismatch');
    expect(await rpcCode(confirm(5000, 'inr'))).toBe('amount_mismatch');
    expect(await rpcCode(admin().rpc('confirm_gift_card_purchase', { p_session_id: 'cs_test_unknown', p_amount_minor: 5000, p_currency: 'usd' }))).toBe('purchase_not_found');

    const first = unwrap(await confirm(5000, 'usd')) as { status: string; code: string };
    expect(first.status).toBe('paid');
    expect(first.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{6}-[0-9A-Z]{4}$/);
    // the success page and the webhook may both get here
    expect((unwrap(await confirm(5000, 'usd')) as { code: string }).code).toBe(first.code);

    const { data: card } = await admin().from('gift_cards').select('amount_minor, market_id, purchased_by, issued_to').eq('code', first.code).single();
    expect(card).toEqual({ amount_minor: 5000, market_id: 'US', purchased_by: buyer.id, issued_to: null });

    const [mine] = await listGiftCardPurchases(buyer.db, 'US');
    expect(mine).toMatchObject({ code: first.code, status: 'paid', redeemed: false, recipientName: 'Lucky' });
    expect(await listGiftCardPurchases(friend.db, 'US')).toEqual([]);
    expect(await listGiftCardPurchases(buyer.db, 'IN')).toEqual([]);
  });

  it('the code works for anyone once, and the buyer sees it redeemed', async () => {
    const [mine] = await listGiftCardPurchases(buyer.db, 'US');
    const before = (await storeBalance(friend.db, 'US')) ?? 0;
    expect(await redeemGiftCard(friend.db, 'US', mine.code)).toEqual({ amountMinor: 5000, balanceMinor: before + 5000 });
    expect(await code(redeemGiftCard(buyer.db, 'US', mine.code))).toBe('gift_card_redeemed');
    expect((await listGiftCardPurchases(buyer.db, 'US'))[0].redeemed).toBe(true);
  });
});
