import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { balanceHistory, storeBalance } from '@/lib/data/balance';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, getOrder, noRushReward, placeOrder } from '@/lib/data/orders';
import { plannedSchedule } from '@/lib/decision/tracking';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const LA = 'America/Los_Angeles';
const same = (a: string | null | undefined, b: string | null | undefined) => expect(a && Date.parse(a)).toBe(b && Date.parse(b));

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

/** Ship an order a minute ago (as the warehouse would, once its time came). */
const ship = async (id: string) => {
  const { error } = await admin().from('orders').update({ shipped_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', id);
  if (error) throw error;
};
const creditedAt = async (id: string) => (await admin().from('orders').select('reward_credited_at').eq('id', id).single()).data?.reward_credited_at ?? null;

describe('No-Rush Shipping', () => {
  let shopper: TestUser;
  let other: TestUser;
  let us: { id: string };
  let inProduct: { id: string };

  beforeAll(async () => {
    [shopper, other, us, inProduct] = await Promise.all([newUser('No Rush'), newUser('No Rush Other'), pickProduct('US', 116), pickProduct('IN', 1)]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(shopper), deleteUser(other)]);
  });

  const order = async (u: TestUser, speed: 'no_rush' | 'standard' = 'no_rush') => {
    await u.db.rpc('cart_clear', { p_market: 'US' });
    await setCartQty(u.db, 'US', us.id, 1);
    return placeOrder(u.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, speed });
  };

  it('is offered in the US store for a reward, and refused in the India store', async () => {
    expect(await noRushReward(anon(), 'US')).toBe(100);
    expect(await noRushReward(anon(), 'IN')).toBeNull();
    await shopper.db.rpc('cart_clear', { p_market: 'IN' });
    await setCartQty(shopper.db, 'IN', inProduct.id, 1);
    expect(await code(placeOrder(shopper.db, 'IN', { paymentMethod: 'upi', shipping: IN_SHIPPING, speed: 'no_rush' }))).toBe('delivery_option_unavailable');
    await shopper.db.rpc('cart_clear', { p_market: 'IN' });
  });

  it('ships 4 days after standard would, costs what standard does, and keeps its reward', async () => {
    const o = await order(shopper);
    expect(o.shipSpeed).toBe('no_rush');
    expect(o.noRushReward).toEqual({ amountMinor: 100 });
    const plan = plannedSchedule(o.placedAt!, LA, 'no_rush');
    same(o.shippedAt, plan.shippedAt);
    same(o.outForDeliveryAt, plan.outForDeliveryAt);
    same(o.deliveredAt, plan.deliveredAt);
    expect(Date.parse(o.shippedAt!) - Date.parse(o.placedAt!)).toBe(106 * 3_600_000);

    const standard = await order(other, 'standard');
    expect(o.totals.shipMinor).toBe(standard.totals.shipMinor);
    expect(o.totals.totalMinor).toBe(standard.totals.totalMinor);
    expect(standard.noRushReward).toBeUndefined();
    // the reward is the order's own: nobody writes it
    const forged = await shopper.db.from('orders').update({ no_rush_reward_minor: 500 }).eq('id', o.id).select();
    expect(forged.error ?? (forged.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
  });

  it('adds the reward to the gift card balance once the order has shipped, once', async () => {
    const o = await order(shopper);
    const before = (await storeBalance(shopper.db, 'US'))!;
    expect(await creditedAt(o.id)).toBeNull();
    expect((await balanceHistory(shopper.db, 'US', 50)).filter((e) => e.kind === 'reward' && e.orderId === o.id)).toEqual([]);

    await ship(o.id);
    expect(await storeBalance(shopper.db, 'US')).toBe(before + 100);
    expect(await storeBalance(shopper.db, 'US')).toBe(before + 100);
    const rewards = (await balanceHistory(shopper.db, 'US', 50)).filter((e) => e.kind === 'reward' && e.orderId === o.id);
    expect(rewards.map((e) => e.amountMinor)).toEqual([100]);
    expect((await getOrder(shopper.db, o.id))?.noRushReward?.creditedAt).toBeTruthy();
  });

  it('earns nothing when cancelled', async () => {
    const o = await order(shopper);
    await cancelOrder(shopper.db, o.id);
    await ship(o.id);
    const balance = await storeBalance(shopper.db, 'US');
    expect(await storeBalance(shopper.db, 'US')).toBe(balance);
    expect(await creditedAt(o.id)).toBeNull();
    expect((await getOrder(shopper.db, o.id))?.noRushReward).toEqual({ amountMinor: 100 });
  });

  it('is settled only for the shopper it belongs to', async () => {
    const o = await order(shopper);
    await ship(o.id);
    expect((await other.db.rpc('settle_no_rush_rewards', { p_market: 'US' })).data).toBe(0);
    expect((await anon().rpc('settle_no_rush_rewards', { p_market: 'US' })).error).toBeTruthy();
    expect(await creditedAt(o.id)).toBeNull();
    expect((await shopper.db.rpc('settle_no_rush_rewards', { p_market: 'US' })).data).toBe(100);
    expect(await creditedAt(o.id)).toBeTruthy();
  });

  it('is there to spend when paying from the balance', async () => {
    const o = await order(shopper);
    await ship(o.id);
    // placing the next order credits it first, without reading the balance
    await order(shopper, 'standard');
    expect(await creditedAt(o.id)).toBeTruthy();
  });
});
