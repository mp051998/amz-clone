import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAddress } from '@/lib/data/addresses';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { placeOrder, setOrderAddress, setOrderInstructions } from '@/lib/data/orders';
import { listPickupPoints } from '@/lib/data/pickup';
import { plannedSchedule } from '@/lib/decision/tracking';
import { anon, deleteUser, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const same = (a: string | null | undefined, b: string | null | undefined) => expect(a && Date.parse(a)).toBe(b && Date.parse(b));

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('Pickup points', () => {
  let shopper: TestUser;
  let us: { id: string };
  let inProduct: { id: string };

  beforeAll(async () => {
    [shopper, us, inProduct] = await Promise.all([newUser('Pickup Shopper'), pickProduct('US', 115), pickProduct('IN', 2)]);
  });
  afterAll(async () => {
    await deleteUser(shopper);
  });

  const fillCart = async (market: 'US' | 'IN', id: string) => {
    await shopper.db.rpc('cart_clear', { p_market: market });
    await setCartQty(shopper.db, market, id, 1);
  };

  it('anyone sees each store’s lockers and counters; nobody writes them', async () => {
    const usPoints = await listPickupPoints(anon(), 'US');
    const inPoints = await listPickupPoints(anon(), 'IN');
    expect(usPoints.length).toBeGreaterThanOrEqual(4);
    expect(inPoints.length).toBeGreaterThanOrEqual(4);
    expect(usPoints.every((p) => p.id.startsWith('US-'))).toBe(true);
    expect(new Set(usPoints.map((p) => p.kind))).toEqual(new Set(['locker', 'counter']));
    expect((await listPickupPoints(anon(), 'US', 'seattle')).every((p) => p.city === 'Seattle')).toBe(true);

    const forged = await shopper.db.from('pickup_points').insert({
      id: 'US-FAKE', market_id: 'US', kind: 'locker', name: 'Fake', line1: '1 Main St', city: 'Seattle', state: 'WA', postcode: '98101', hours: 'Never', hold_days: 3,
    });
    expect(forged.error).toBeTruthy();
    const closed = await shopper.db.from('pickup_points').update({ active: false }).eq('id', usPoints[0].id).select();
    expect(closed.error ?? (closed.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
  });

  it('a pickup order ships to the point with a six-digit code, on the standard schedule', async () => {
    const [point] = await listPickupPoints(anon(), 'US', 'Juniper');
    await fillCart('US', us.id);
    const o = await placeOrder(shopper.db, 'US', {
      paymentMethod: 'giftcard',
      shipping: { fullName: US_SHIPPING.fullName, phone: US_SHIPPING.phone, instructions: 'Leave at the door' },
      pickupPoint: point.id,
    });
    expect(o.pickup?.pointId).toBe(point.id);
    expect(o.pickup?.code).toMatch(/^[0-9]{6}$/);
    expect(o.shipTo).toMatchObject({ name: US_SHIPPING.fullName, phone: US_SHIPPING.phone, line1: point.name, line2: point.line1, city: point.city, state: point.state, postcode: point.postcode });
    expect(o.shipTo.instructions).toBeUndefined();
    const plan = plannedSchedule(o.placedAt!, 'America/Los_Angeles');
    same(o.deliveredAt, plan.deliveredAt);

    // no courier to instruct
    expect(await code(setOrderInstructions(shopper.db, o.id, 'Ring twice'))).toBe('order_not_editable');

    // sent to an address in the book instead, it's no longer a pickup
    const home = await createAddress(shopper.db, 'US', US_SHIPPING);
    const moved = await setOrderAddress(shopper.db, o.id, home.id);
    expect(moved.pickup).toBeUndefined();
    expect(moved.shipTo.line1).toBe(US_SHIPPING.line1);
  });

  it('the database refuses another store’s point, or none by that id', async () => {
    const [inPoint] = await listPickupPoints(anon(), 'IN');
    await fillCart('US', us.id);
    const place = (pickup: string) =>
      shopper.db.rpc('place_order', {
        p_market: 'US',
        p_payment_method: 'giftcard',
        p_shipping: { full_name: US_SHIPPING.fullName, phone: US_SHIPPING.phone, line1: 'x', city: 'x', state: 'WA', postcode: '98109', pickup_point: pickup },
      });
    expect((await place(inPoint.id)).error?.message).toBe('pickup_point_not_found');
    expect((await place('US-NOWHERE')).error?.message).toBe('pickup_point_not_found');
    // the client checks first
    expect(await code(placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, pickupPoint: inPoint.id }))).toBe('pickup_point_not_found');
  });

  it('lockers don’t take cash; counters do', async () => {
    const points = await listPickupPoints(anon(), 'IN');
    const locker = points.find((p) => p.kind === 'locker')!;
    const counter = points.find((p) => p.kind === 'counter')!;
    const who = { fullName: IN_SHIPPING.fullName, phone: IN_SHIPPING.phone };
    await fillCart('IN', inProduct.id);
    expect(await code(placeOrder(shopper.db, 'IN', { paymentMethod: 'cod', shipping: who, pickupPoint: locker.id }))).toBe('pickup_cod_unavailable');
    const o = await placeOrder(shopper.db, 'IN', { paymentMethod: 'cod', shipping: who, pickupPoint: counter.id });
    expect(o.pickup?.pointId).toBe(counter.id);
    expect(o.shipTo).toMatchObject({ line1: counter.name, line2: counter.line1, postcode: counter.postcode });
  });
});
