import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getCart, setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { joinPlus, leavePlus, plusMembership } from '@/lib/data/plus';
import { deliveryOptions } from '@/lib/decision/tracking';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, US_SHIPPING, type TestUser } from './helpers';

const TZ = { US: 'America/Los_Angeles', IN: 'Asia/Kolkata' } as const;
const METHOD = { US: 'giftcard', IN: 'upi' } as const;
const SHIPPING = { US: US_SHIPPING, IN: IN_SHIPPING } as const;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

/** An in-stock product priced under the store's free-delivery threshold. */
async function cheapProduct(market: 'US' | 'IN') {
  const { data: m } = await admin().from('markets').select('free_ship_threshold_minor').eq('id', market).single();
  const { data, error } = await admin()
    .from('products')
    .select('id, price_minor')
    .eq('market_id', market)
    .is('archived_at', null)
    .gte('stock', 25)
    .lt('price_minor', m!.free_ship_threshold_minor)
    .order('id')
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

describe('Plus membership', () => {
  let member: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    [member, other] = await Promise.all([newUser('Plus Member'), newUser('Not A Member')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(member), deleteUser(other)]);
  });

  it('joins once, and each shopper only sees their own membership', async () => {
    expect(await plusMembership(member.db)).toBeNull();
    const first = await joinPlus(member.db);
    expect(Date.parse(first.since)).not.toBeNaN();
    expect(await joinPlus(member.db)).toEqual(first);
    expect(await plusMembership(member.db)).toEqual(first);
    expect(await plusMembership(other.db)).toBeNull();
    expect(await plusMembership(anon())).toBeNull();
  });

  it('membership only changes through join_plus / leave_plus', async () => {
    const forged = await other.db.from('plus_members').insert({ user_id: other.id });
    expect(forged.error).toBeTruthy();
    const backdated = await member.db.from('plus_members').update({ joined_at: '2020-01-01T00:00:00Z' }).eq('user_id', member.id).select();
    expect(backdated.error ?? (backdated.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    const { error } = await anon().rpc('join_plus');
    expect(error).toBeTruthy();
  });

  it('members pay no delivery on any total; everyone else still does', async () => {
    const totals = async (db: TestUser['db']) => (await db.rpc('order_totals', { p_market: 'US', p_subtotal: 3000 })).data![0];
    expect(await totals(member.db)).toEqual({ subtotal_minor: 3000, ship_minor: 0, tax_minor: 240, total_minor: 3240 });
    expect((await totals(other.db)).ship_minor).toBe(599);
    expect((await totals(anon())).ship_minor).toBe(599);
    const inr = (await member.db.rpc('order_totals', { p_market: 'IN', p_subtotal: 30000 })).data![0];
    expect(inr).toEqual({ subtotal_minor: 30000, ship_minor: 0, tax_minor: 0, total_minor: 30000 });
  });

  it('a member’s small cart and order ship free', async () => {
    const p = await cheapProduct('US');
    await member.db.rpc('cart_clear', { p_market: 'US' });
    const cart = await setCartQty(member.db, 'US', p.id, 1);
    expect(cart.totals.shipMinor).toBe(0);
    const order = await placeOrder(member.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    expect(order.totals.shipMinor).toBe(0);
    expect(order.totals.totalMinor).toBe(order.totals.subtotalMinor + order.totals.taxMinor);
  });

  it('faster delivery is free for members while it is offered', async () => {
    // the hours when fast isn't offered (about noon to 5 PM local) never overlap between the two stores
    let placedFast = 0;
    for (const market of ['US', 'IN'] as const) {
      if (deliveryOptions(new Date(), TZ[market]).fast === null) continue;
      const p = await cheapProduct(market);
      await member.db.rpc('cart_clear', { p_market: market });
      await setCartQty(member.db, market, p.id, 1);
      const o = await placeOrder(member.db, market, { paymentMethod: METHOD[market], shipping: SHIPPING[market], speed: 'fast' });
      expect(o.shipSpeed).toBe('fast');
      expect(o.totals.shipMinor).toBe(0);
      placedFast++;
    }
    expect(placedFast).toBeGreaterThan(0);
  });

  it('after leaving, delivery is charged again and orders already placed keep theirs', async () => {
    await leavePlus(member.db);
    expect(await plusMembership(member.db)).toBeNull();
    const p = await cheapProduct('US');
    await member.db.rpc('cart_clear', { p_market: 'US' });
    expect((await setCartQty(member.db, 'US', p.id, 1)).totals.shipMinor).toBe(599);
    const { data: placed } = await member.db.from('orders').select('ship_minor').eq('market_id', 'US');
    expect(placed!.length).toBeGreaterThan(0);
    expect(placed!.every((o) => o.ship_minor === 0)).toBe(true);
    await leavePlus(member.db); // leaving twice is fine
    expect((await getCart(member.db, 'US')).totals.shipMinor).toBe(599);
  });

  it('signed out, joining is refused', async () => {
    expect(await code(joinPlus(anon()))).not.toBe('no error');
  });
});
