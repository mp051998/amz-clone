import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAddress, updateAddress } from '@/lib/data/addresses';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, getOrder, placeOrder, setOrderAddress, setOrderDropoff } from '@/lib/data/orders';
import { listPickupPoints } from '@/lib/data/pickup';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

describe('drop-off spots', () => {
  let me: TestUser;
  let other: TestUser;
  beforeAll(async () => {
    [me, other] = await Promise.all([newUser('Porch Person'), newUser('Someone Else')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(me), deleteUser(other)]);
  });

  /** A placed (cash on delivery) India order, with a spot from checkout. */
  async function placed(dropoff?: string) {
    const p = await pickProduct('IN', 64);
    return placeOrder(me.db, 'IN', { paymentMethod: 'cod', shipping: { ...IN_SHIPPING, dropoff }, buyNow: { productId: p.id, qty: 1 } });
  }

  it('keeps an address’s spot, clears it, and refuses one it doesn’t know', async () => {
    const home = await createAddress(me.db, 'US', { ...US_SHIPPING, dropoff: 'side_porch' });
    expect(home.dropoff).toBe('side_porch');
    const cleared = await updateAddress(me.db, 'US', home.id, { ...US_SHIPPING, dropoff: '' });
    expect(cleared.dropoff).toBeUndefined();
    expect(await code(updateAddress(me.db, 'US', home.id, { ...US_SHIPPING, dropoff: 'roof' }))).toBe('invalid_input:dropoff');
    // and so does the database
    const { error } = await me.db.from('addresses').update({ dropoff: 'roof' }).eq('id', home.id);
    expect(error?.code).toBe('23514');
  });

  it('puts checkout’s spot on the order, changeable until it’s out for delivery', async () => {
    const order = await placed('reception');
    expect(order.shipTo.dropoff).toBe('reception');
    expect((await getOrder(me.db, order.id))?.shipTo.dropoff).toBe('reception');

    expect((await setOrderDropoff(me.db, order.id, 'mailroom')).shipTo.dropoff).toBe('mailroom');
    expect((await setOrderDropoff(me.db, order.id, null)).shipTo.dropoff).toBeUndefined();
    expect(await code(setOrderDropoff(other.db, order.id, 'garage'))).toBe('order_not_found');

    const hour = 3_600_000;
    const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
    const svc = admin();
    const shipped = await svc.from('orders').update({ shipped_at: iso(-hour), out_for_delivery_at: iso(10 * hour), delivered_at: iso(12 * hour) }).eq('id', order.id);
    if (shipped.error) throw shipped.error;
    expect((await setOrderDropoff(me.db, order.id, 'front_door')).shipTo.dropoff).toBe('front_door');

    const out = await svc.from('orders').update({ out_for_delivery_at: iso(-60_000) }).eq('id', order.id);
    if (out.error) throw out.error;
    expect(await code(setOrderDropoff(me.db, order.id, 'garage'))).toBe('order_not_editable');
    expect((await getOrder(me.db, order.id))?.shipTo.dropoff).toBe('front_door');
  });

  it('an order with none has none, and the database refuses a spot it doesn’t know', async () => {
    const order = await placed();
    expect(order.shipTo.dropoff).toBeUndefined();
    const { error } = await me.db.rpc('set_my_order_dropoff', { p_order_id: order.id, p_dropoff: 'roof' });
    expect(error?.message).toBe('invalid_input');
    await cancelOrder(me.db, order.id);
    expect(await code(setOrderDropoff(me.db, order.id, 'garage'))).toBe('order_not_editable');
  });

  it('moves with the address the order is sent to', async () => {
    const office = await createAddress(me.db, 'IN', { ...IN_SHIPPING, line1: '4th Floor, Embassy Tech Square', postcode: '560103', addressType: 'office', dropoff: 'reception' });
    const flat = await createAddress(me.db, 'IN', { ...IN_SHIPPING, line1: '7, Lake View Apartments', postcode: '560038' });
    const order = await placed('garage');
    expect((await setOrderAddress(me.db, order.id, office.id)).shipTo).toMatchObject({ line1: '4th Floor, Embassy Tech Square', dropoff: 'reception' });
    expect((await setOrderAddress(me.db, order.id, flat.id)).shipTo.dropoff).toBeUndefined();
  });

  it('can be set on an unpaid checkout, but not on a pickup order', async () => {
    const p = await pickProduct('US', 87);
    const unpaid = await placeOrder(me.db, 'US', { paymentMethod: 'card', shipping: { ...US_SHIPPING, dropoff: 'back_door' }, buyNow: { productId: p.id, qty: 1 } });
    expect(unpaid.status).toBe('awaiting_payment');
    expect(unpaid.shipTo.dropoff).toBe('back_door');
    await cancelOrder(me.db, unpaid.id);

    const [point] = await listPickupPoints(anon(), 'US');
    const pickup = await placeOrder(me.db, 'US', {
      paymentMethod: 'giftcard',
      shipping: { fullName: US_SHIPPING.fullName, phone: US_SHIPPING.phone, dropoff: 'front_door' },
      pickupPoint: point.id,
      buyNow: { productId: p.id, qty: 1 },
    });
    expect(pickup.pickup?.pointId).toBe(point.id);
    expect(pickup.shipTo.dropoff).toBeUndefined();
    expect(await code(setOrderDropoff(me.db, pickup.id, 'front_door'))).toBe('order_not_editable');
    await cancelOrder(me.db, pickup.id);
  });
});
