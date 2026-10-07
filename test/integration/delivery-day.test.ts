import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { getOrder, placeOrder } from '@/lib/data/orders';
import { joinPlus, leavePlus, plusMembership, setDeliveryDay } from '@/lib/data/plus';
import { plannedSchedule } from '@/lib/decision/tracking';
import { anon, deleteUser, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const LA = 'America/Los_Angeles';
const same = (a: string | null | undefined, b: string | null | undefined) => expect(a && Date.parse(a)).toBe(b && Date.parse(b));
const local = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: LA }).format(new Date(iso));

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('Delivery Day', () => {
  let member: TestUser;
  let other: TestUser;
  let us: { id: string };
  let inProduct: { id: string };

  beforeAll(async () => {
    [member, other, us, inProduct] = await Promise.all([newUser('Day Member'), newUser('Day Not Member'), pickProduct('US', 114), pickProduct('IN', 1)]);
    await joinPlus(member.db);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(member), deleteUser(other)]);
  });

  const fillCart = async (u: TestUser, market: 'US' | 'IN', id: string) => {
    await u.db.rpc('cart_clear', { p_market: market });
    await setCartQty(u.db, market, id, 1);
  };

  it('only members pick a day, a weekday from 1 to 7, and only through set_delivery_day', async () => {
    expect(await code(setDeliveryDay(other.db, 5))).toBe('plus_required');
    expect(await code(setDeliveryDay(anon(), 5))).not.toBe('no error');
    expect(await code(setDeliveryDay(member.db, 0))).toBe('invalid_input');
    expect(await code(setDeliveryDay(member.db, 8))).toBe('invalid_input');

    expect(await setDeliveryDay(member.db, 5)).toBe(5);
    expect(await plusMembership(member.db)).toMatchObject({ deliveryDay: 5 });

    const forged = await member.db.from('plus_members').update({ delivery_day: 2 }).eq('user_id', member.id).select();
    expect(forged.error ?? (forged.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    expect((await plusMembership(member.db))?.deliveryDay).toBe(5);

    expect(await setDeliveryDay(member.db, null)).toBeNull();
    expect(await plusMembership(member.db)).not.toHaveProperty('deliveryDay');
  });

  it('is refused without a day, without Plus, and in the India store', async () => {
    await fillCart(member, 'US', us.id);
    const day = { paymentMethod: 'giftcard', shipping: US_SHIPPING, speed: 'day' } as const;
    expect(await code(placeOrder(member.db, 'US', day))).toBe('delivery_option_unavailable');

    await fillCart(other, 'US', us.id);
    expect(await code(placeOrder(other.db, 'US', day))).toBe('delivery_option_unavailable');

    await setDeliveryDay(member.db, 5);
    await fillCart(member, 'IN', inProduct.id);
    expect(await code(placeOrder(member.db, 'IN', { paymentMethod: 'upi', shipping: IN_SHIPPING, speed: 'day' }))).toBe('delivery_option_unavailable');
    await member.db.rpc('cart_clear', { p_market: 'IN' });
  });

  it('arrives on the chosen weekday on the morning run, no sooner than standard, FREE for members', async () => {
    await setDeliveryDay(member.db, 5);
    await fillCart(member, 'US', us.id);
    const o = await placeOrder(member.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, speed: 'day' });
    expect(o.shipSpeed).toBe('day');
    expect(o.deliveryDay).toBe(5);
    expect(o.totals.shipMinor).toBe(0);

    const plan = plannedSchedule(o.placedAt!, LA, 'day', 5);
    same(o.shippedAt, plan.shippedAt);
    same(o.outForDeliveryAt, plan.outForDeliveryAt);
    same(o.deliveredAt, plan.deliveredAt);

    expect(local(o.deliveredAt!, { weekday: 'long' })).toBe('Friday');
    expect(local(o.outForDeliveryAt!, { hour: 'numeric', minute: '2-digit' })).toBe('9:00 AM');
    expect(local(o.deliveredAt!, { hour: 'numeric', minute: '2-digit' })).toBe('11:30 AM');
    const standard = Date.parse(plannedSchedule(o.placedAt!, LA).deliveredAt);
    const delivered = Date.parse(o.deliveredAt!);
    expect(delivered).toBeGreaterThanOrEqual(standard);
    expect(delivered - standard).toBeLessThan(7 * 86_400_000);
    expect(Date.parse(o.shippedAt!)).toBeLessThan(Date.parse(o.outForDeliveryAt!));
  });

  it('leaving Plus drops the day; orders already placed keep theirs', async () => {
    const { data: placed } = await member.db.from('orders').select('id').eq('ship_speed', 'day').limit(1).single();
    await leavePlus(member.db);
    await joinPlus(member.db);
    expect(await plusMembership(member.db)).not.toHaveProperty('deliveryDay');
    expect((await getOrder(member.db, placed!.id))?.deliveryDay).toBe(5);
  });
});
