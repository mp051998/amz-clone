import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { listPickupPoints } from '@/lib/data/pickup';
import { cancelReturn, chooseReturnMethod, getOrderReturns, requestReturn } from '@/lib/data/returns';
import { localDayOf } from '@/lib/decision/tracking';
import type { Order } from '@/lib/types';
import { anon, deleteUser, deliveredDaysAgo, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

const DAY = 86_400_000;
const TZ = 'America/Los_Angeles';

let buyer: TestUser;
let other: TestUser;

beforeAll(async () => {
  [buyer, other] = await Promise.all([newUser('Return Method Buyer'), newUser('Return Method Other')]);
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(other)]);
});

/** A delivered US order of one product by `buyer`, to an address or a pickup point. */
async function deliveredOrder(offset: number, pickupPoint?: string): Promise<{ order: Order; product: string }> {
  const p = await pickProduct('US', offset);
  await buyer.db.rpc('cart_clear', { p_market: 'US' });
  await setCartQty(buyer.db, 'US', p.id, 1);
  const order = await placeOrder(
    buyer.db,
    'US',
    pickupPoint
      ? { paymentMethod: 'giftcard', shipping: { fullName: US_SHIPPING.fullName, phone: US_SHIPPING.phone }, pickupPoint }
      : { paymentMethod: 'giftcard', shipping: US_SHIPPING },
  );
  await deliveredDaysAgo(order.id, 1);
  return { order, product: p.id };
}

describe('return methods', () => {
  it('starts as a drop-off anywhere, then goes to a chosen point or a courier pickup, until it’s closed', async () => {
    const { order, product } = await deliveredOrder(40);
    const started = await requestReturn(buyer.db, order.id, { items: [{ productId: product, qty: 1 }], reason: 'no_longer_needed' });
    expect(started.dropoffPoint).toBeUndefined();
    expect(started.pickupOn).toBeUndefined();

    const [point] = await listPickupPoints(anon(), 'US', 'Juniper');
    const atPoint = await chooseReturnMethod(buyer.db, started.id, { method: 'dropoff', pickupPointId: point.id });
    expect(atPoint.dropoffPoint).toMatchObject({ id: point.id, kind: point.kind, name: point.name, city: point.city, hours: point.hours });
    expect(atPoint.pickupOn).toBeUndefined();
    expect(atPoint.dropoffCode).toBe(started.dropoffCode);

    // a courier on a day from the store's tomorrow
    const tomorrow = localDayOf(new Date(Date.now() + DAY).toISOString(), TZ);
    const picked = await chooseReturnMethod(buyer.db, started.id, { method: 'pickup', pickupOn: tomorrow });
    expect(picked.pickupOn).toBe(tomorrow);
    expect(picked.dropoffPoint).toBeUndefined();
    const listed = (await getOrderReturns(buyer.db, order.id))!.returns.find((r) => r.id === started.id)!;
    expect(listed.pickupOn).toBe(tomorrow);

    // not today, not after the drop-off deadline, not without a day; nowhere that isn't a working US point
    const today = localDayOf(new Date().toISOString(), TZ);
    const late = localDayOf(new Date(Date.parse(started.dropoffBy!) + 2 * DAY).toISOString(), TZ);
    expect(await failure(chooseReturnMethod(buyer.db, started.id, { method: 'pickup', pickupOn: today }))).toBe('invalid_input:pickup_on');
    expect(await failure(chooseReturnMethod(buyer.db, started.id, { method: 'pickup', pickupOn: late }))).toBe('invalid_input:pickup_on');
    expect(await failure(chooseReturnMethod(buyer.db, started.id, { method: 'pickup' }))).toBe('invalid_input:pickup_on');
    const [inPoint] = await listPickupPoints(anon(), 'IN');
    expect(await failure(chooseReturnMethod(buyer.db, started.id, { method: 'dropoff', pickupPointId: inPoint.id }))).toBe('invalid_input:pickup_point');
    const raw = await buyer.db.rpc('choose_return_method', { p_return_id: started.id, p_method: 'teleport' });
    expect([raw.error?.message, raw.error?.details]).toEqual(['invalid_input', 'method']);

    // back to anywhere
    const anywhere = await chooseReturnMethod(buyer.db, started.id, { method: 'dropoff' });
    expect([anywhere.dropoffPoint, anywhere.pickupOn]).toEqual([undefined, undefined]);

    // someone else's return isn't there; a cancelled one is closed
    expect(await failure(chooseReturnMethod(other.db, started.id, { method: 'dropoff' }))).toBe('return_not_found');
    await cancelReturn(buyer.db, started.id);
    expect(await failure(chooseReturnMethod(buyer.db, started.id, { method: 'dropoff' }))).toBe('return_not_open');
  });

  it('an order collected from a pickup point can only be dropped off', async () => {
    const [point] = await listPickupPoints(anon(), 'US', 'Juniper');
    const { order, product } = await deliveredOrder(42, point.id);
    const started = await requestReturn(buyer.db, order.id, { items: [{ productId: product, qty: 1 }], reason: 'no_longer_needed' });
    const tomorrow = localDayOf(new Date(Date.now() + DAY).toISOString(), TZ);
    expect(await failure(chooseReturnMethod(buyer.db, started.id, { method: 'pickup', pickupOn: tomorrow }))).toBe('invalid_input:method');
    expect((await chooseReturnMethod(buyer.db, started.id, { method: 'dropoff', pickupPointId: point.id })).dropoffPoint?.id).toBe(point.id);
  });

  it('isn’t for anyone signed out', async () => {
    const res = await anon().rpc('choose_return_method', { p_return_id: '00000000-0000-4000-8000-000000000000', p_method: 'dropoff' });
    expect(res.error).toBeTruthy();
  });
});
