import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliverOrder } from '@/lib/data/admin-orders';
import { receiveReturn } from '@/lib/data/admin-returns';
import { balanceHistory, claimDemoGiftCard, demoGiftCard, redeemGiftCard, storeBalance } from '@/lib/data/balance';
import { getCart, setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { requestReturn } from '@/lib/data/returns';
import type { Market } from '@/lib/types';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

/** An in-stock product priced under (or, with `over`, above) the given amount. */
async function productPriced(market: Market, { under, over }: { under?: number; over?: number }) {
  let q = admin().from('products').select('id, price_minor').eq('market_id', market).is('archived_at', null).gte('stock', 25);
  if (under !== undefined) q = q.lt('price_minor', under);
  if (over !== undefined) q = q.gt('price_minor', over);
  const { data, error } = await q.order('id').limit(1).single();
  if (error) throw error;
  return data;
}

const DEMO = { US: 10_000, IN: 500_000 } as const;

describe('gift card balance', () => {
  // shopper and friend start with nothing; boss is an admin
  let shopper: TestUser;
  let friend: TestUser;
  let boss: TestUser;

  beforeAll(async () => {
    [shopper, friend, boss] = await Promise.all([
      newUser('Balance Shopper', { funded: false }),
      newUser('Balance Friend', { funded: false }),
      newUser('Balance Admin'),
    ]);
    const { error } = await admin().from('admins').insert({ user_id: boss.id });
    if (error) throw error;
  });
  afterAll(async () => {
    await Promise.all([deleteUser(shopper), deleteUser(friend), deleteUser(boss)]);
  });

  it('starts at zero; each account gets one demo card per store', async () => {
    expect(await storeBalance(shopper.db, 'US')).toBe(0);
    expect(await balanceHistory(shopper.db, 'US')).toEqual([]);

    const us = await claimDemoGiftCard(shopper.db, 'US');
    expect(us).toMatchObject({ amountMinor: DEMO.US, redeemed: false });
    expect(us.code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{6}-[0-9A-F]{4}$/);
    expect(await claimDemoGiftCard(shopper.db, 'US')).toEqual(us);
    expect(await demoGiftCard(shopper.db, 'US', shopper.id)).toEqual(us);

    const inr = await claimDemoGiftCard(shopper.db, 'IN');
    expect(inr.amountMinor).toBe(DEMO.IN);
    expect(inr.code).not.toBe(us.code);

    // claiming doesn't redeem, and other shoppers can't see the card
    expect(await storeBalance(shopper.db, 'US')).toBe(0);
    expect(await demoGiftCard(friend.db, 'US', shopper.id)).toBeNull();
  });

  it('with no balance, paying from it is refused and the cart is kept', async () => {
    const p = await productPriced('US', { under: 3500 });
    await shopper.db.rpc('cart_clear', { p_market: 'US' });
    await setCartQty(shopper.db, 'US', p.id, 1);
    expect(await code(placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING }))).toBe('insufficient_balance');
    expect((await getCart(shopper.db, 'US')).lines.map((l) => l.product.id)).toEqual([p.id]);
  });

  it('a code is redeemed once, in its own store, by whoever holds it', async () => {
    const us = (await demoGiftCard(shopper.db, 'US', shopper.id))!;
    expect(await code(redeemGiftCard(shopper.db, 'IN', us.code))).toBe('gift_card_other_store');
    // case, spaces and dashes don't matter
    const typed = ` ${us.code.toLowerCase().replace(/-/g, ' ')} `;
    expect(await redeemGiftCard(shopper.db, 'US', typed)).toEqual({ amountMinor: DEMO.US, balanceMinor: DEMO.US });
    expect(await code(redeemGiftCard(shopper.db, 'US', us.code))).toBe('gift_card_redeemed');
    expect(await code(redeemGiftCard(friend.db, 'US', us.code))).toBe('gift_card_redeemed');
    expect(await code(redeemGiftCard(shopper.db, 'US', 'ZZZZ-ZZZZZZ-ZZZZ'))).toBe('gift_card_not_found');
    expect(await code(redeemGiftCard(shopper.db, 'US', 'not a code'))).toBe('gift_card_not_found');
    expect(await code(redeemGiftCard(shopper.db, 'US', '   '))).toBe('invalid_input');
    expect(await demoGiftCard(shopper.db, 'US', shopper.id)).toMatchObject({ redeemed: true });
    expect(await balanceHistory(shopper.db, 'US')).toEqual([
      expect.objectContaining({ amountMinor: DEMO.US, kind: 'gift_card', giftCardCode: us.code, orderId: null }),
    ]);

    // the India card, passed on to a friend
    const inr = (await demoGiftCard(shopper.db, 'IN', shopper.id))!;
    expect(await redeemGiftCard(friend.db, 'IN', inr.code)).toEqual({ amountMinor: DEMO.IN, balanceMinor: DEMO.IN });
    expect(await storeBalance(shopper.db, 'IN')).toBe(0);
    expect(await storeBalance(friend.db, 'IN')).toBe(DEMO.IN);
    expect(await storeBalance(friend.db, 'US')).toBe(0);
  });

  it('an order takes exactly its total, and cancelling it puts the total back', async () => {
    const p = await productPriced('US', { under: 3500 });
    await shopper.db.rpc('cart_clear', { p_market: 'US' });
    await setCartQty(shopper.db, 'US', p.id, 1);
    const order = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    expect(order.totals.totalMinor).toBeGreaterThan(0);
    expect(await storeBalance(shopper.db, 'US')).toBe(DEMO.US - order.totals.totalMinor);
    expect((await balanceHistory(shopper.db, 'US'))[0]).toMatchObject({ amountMinor: -order.totals.totalMinor, kind: 'order', orderId: order.id });

    await cancelOrder(shopper.db, order.id);
    expect(await storeBalance(shopper.db, 'US')).toBe(DEMO.US);
    expect((await balanceHistory(shopper.db, 'US'))[0]).toMatchObject({ amountMinor: order.totals.totalMinor, kind: 'refund', orderId: order.id });
  });

  it('an order the balance can’t cover is refused without taking anything', async () => {
    const p = await productPriced('US', { over: DEMO.US });
    await shopper.db.rpc('cart_clear', { p_market: 'US' });
    await setCartQty(shopper.db, 'US', p.id, 1);
    expect(await code(placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING }))).toBe('insufficient_balance');
    expect(await storeBalance(shopper.db, 'US')).toBe(DEMO.US);
    await shopper.db.rpc('cart_clear', { p_market: 'US' });
  });

  it('a received return of a balance order is refunded to the balance', async () => {
    const p = await productPriced('IN', { under: 49_900 });
    await friend.db.rpc('cart_clear', { p_market: 'IN' });
    await setCartQty(friend.db, 'IN', p.id, 1);
    const order = await placeOrder(friend.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING });
    const after = DEMO.IN - order.totals.totalMinor;
    expect(await storeBalance(friend.db, 'IN')).toBe(after);

    await deliverOrder(boss.db, order.id);
    const r = await requestReturn(friend.db, order.id, { items: [{ productId: p.id, qty: 1 }], reason: 'damaged' });
    await receiveReturn(boss.db, r.id);
    expect(r.refundMinor).toBeGreaterThan(0);
    expect(await storeBalance(friend.db, 'IN')).toBe(after + r.refundMinor);
    expect((await balanceHistory(friend.db, 'IN'))[0]).toMatchObject({ amountMinor: r.refundMinor, kind: 'refund', orderId: order.id });
  });

  it('balances only change through redeeming and orders, and each shopper sees only their own', async () => {
    const raised = await shopper.db.from('store_balances').update({ balance_minor: 99_999_999 }).eq('user_id', shopper.id).select();
    expect(raised.error ?? (raised.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    const opened = await friend.db.from('store_balances').insert({ user_id: friend.id, market_id: 'US', balance_minor: 5000 });
    expect(opened.error).toBeTruthy();
    const minted = await shopper.db.from('gift_cards').insert({ code: 'AAAA-BBBBBB-CCCC', market_id: 'US', amount_minor: 100_000 });
    expect(minted.error).toBeTruthy();
    const logged = await shopper.db.from('balance_entries').insert({ user_id: shopper.id, market_id: 'US', amount_minor: 1, kind: 'refund' });
    expect(logged.error).toBeTruthy();
    expect(await storeBalance(shopper.db, 'US')).toBe(DEMO.US);
    expect(await storeBalance(friend.db, 'US')).toBe(0);

    const [balances, entries, cards] = await Promise.all([
      friend.db.from('store_balances').select('user_id'),
      friend.db.from('balance_entries').select('user_id'),
      friend.db.from('gift_cards').select('issued_to, redeemed_by'),
    ]);
    expect(balances.data!.every((b) => b.user_id === friend.id)).toBe(true);
    expect(entries.data!.length).toBeGreaterThan(0);
    expect(entries.data!.every((e) => e.user_id === friend.id)).toBe(true);
    // the card the friend redeemed, not the shopper's US one
    expect(cards.data).toEqual([{ issued_to: shopper.id, redeemed_by: friend.id }]);
  });

  it('signed out, nothing can be claimed, redeemed or read', async () => {
    expect(await code(claimDemoGiftCard(anon(), 'US'))).not.toBe('no error');
    expect(await code(redeemGiftCard(anon(), 'US', 'AAAA-BBBBBB-CCCC'))).not.toBe('no error');
    const { data, error } = await anon().from('store_balances').select('user_id');
    expect(error ?? (data?.length === 0 ? 'no rows' : null)).toBeTruthy();
  });
});
