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

describe('buying several gift cards at once', () => {
  let buyer: TestUser;
  let friend: TestUser;
  const session = `cs_test_${crypto.randomUUID()}`;
  beforeAll(async () => {
    [buyer, friend] = await Promise.all([newUser('Bulk Buyer'), newUser('Bulk Friend')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(buyer), deleteUser(friend)]);
  });

  it('takes 1 to 10 cards of one amount', async () => {
    for (const q of [0, 11, -1]) {
      expect(await rpcCode(buyer.db.rpc('start_gift_card_purchase', { p_market: 'US', p_amount_minor: 5000, p_quantity: q }))).toBe('invalid_input');
    }
    for (const q of [0, 11, 2.5, '3']) {
      expect(await code(startGiftCardPurchase(buyer.db, 'US', { amountMinor: 5000, quantity: q }))).toBe('invalid_input');
    }
    // left out, it's one card
    expect((await startGiftCardPurchase(buyer.db, 'US', { amountMinor: 2500 })).quantity).toBe(1);

    const p = await startGiftCardPurchase(buyer.db, 'US', { amountMinor: 5000, quantity: 3, recipientName: 'Team' });
    expect(p).toMatchObject({ amountMinor: 5000, quantity: 3, recipientName: 'Team', status: 'awaiting_payment', code: null, codes: [] });
    unwrap(await admin().rpc('attach_gift_card_session', { p_purchase: p.id, p_session_id: session }));
  });

  it('a reload is always one amount', async () => {
    const { error } = await admin()
      .from('gift_card_purchases')
      .insert({ user_id: buyer.id, market_id: 'US', amount_minor: 5000, currency: 'USD', reload: true, quantity: 2 });
    expect(error).not.toBeNull();
  });

  it('a paid session for the total issues a code per card', async () => {
    const confirm = (amount: number) =>
      admin().rpc('confirm_gift_card_purchase', { p_session_id: session, p_amount_minor: amount, p_currency: 'usd', p_payment_intent: 'pi_test_bulk' });
    // one card's amount isn't the total
    expect(await rpcCode(confirm(5000))).toBe('amount_mismatch');

    const paid = unwrap(await confirm(15000)) as { status: string; code: string; quantity: number; codes: { code: string; redeemed: boolean }[] };
    expect(paid.status).toBe('paid');
    expect(paid.quantity).toBe(3);
    expect(paid.codes).toHaveLength(3);
    expect(new Set(paid.codes.map((c) => c.code)).size).toBe(3);
    expect(paid.codes[0].code).toBe(paid.code);
    // the success page and the webhook may both get here: still the same three
    expect((unwrap(await confirm(15000)) as { codes: unknown[] }).codes).toEqual(paid.codes);

    const { data: cards } = await admin().from('gift_cards').select('code, amount_minor, purchased_by').in('code', paid.codes.map((c) => c.code));
    expect(cards).toHaveLength(3);
    for (const c of cards!) expect(c).toMatchObject({ amount_minor: 5000, purchased_by: buyer.id });

    const [mine] = await listGiftCardPurchases(buyer.db, 'US');
    expect(mine).toMatchObject({ quantity: 3, code: paid.code, redeemed: false, recipientName: 'Team' });
    expect(mine.codes).toEqual(paid.codes);
  });

  it('each code is redeemed on its own, and the purchase is redeemed once all are', async () => {
    const [mine] = await listGiftCardPurchases(buyer.db, 'US');
    const before = (await storeBalance(friend.db, 'US')) ?? 0;
    expect(await redeemGiftCard(friend.db, 'US', mine.codes[1].code)).toEqual({ amountMinor: 5000, balanceMinor: before + 5000 });
    let [now] = await listGiftCardPurchases(buyer.db, 'US');
    expect(now.codes.map((c) => c.redeemed)).toEqual([false, true, false]);
    expect(now.redeemed).toBe(false);

    await redeemGiftCard(friend.db, 'US', mine.codes[0].code);
    await redeemGiftCard(buyer.db, 'US', mine.codes[2].code);
    [now] = await listGiftCardPurchases(buyer.db, 'US');
    expect(now.redeemed).toBe(true);
  });
});
