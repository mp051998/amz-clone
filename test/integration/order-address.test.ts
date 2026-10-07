import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAddress } from '@/lib/data/addresses';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, getOrder, placeOrder, setOrderAddress } from '@/lib/data/orders';
import type { Address } from '@/lib/types';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe("changing an order's delivery address", () => {
  let me: TestUser;
  let other: TestUser;
  let office: Address;
  let flat: Address;
  let usHome: Address;
  let theirs: Address;

  beforeAll(async () => {
    [me, other] = await Promise.all([newUser('Address Mover'), newUser('Someone Else')]);
    // one at a time: a shopper's first address in a store becomes the default
    office = await createAddress(me.db, 'IN', {
      ...IN_SHIPPING,
      line1: '4th Floor, Embassy Tech Square',
      line2: 'Outer Ring Road, Kadubeesanahalli',
      landmark: 'Near the metro',
      postcode: '560103',
      addressType: 'office',
      instructions: 'Leave it at reception',
    });
    flat = await createAddress(me.db, 'IN', { ...IN_SHIPPING, fullName: 'Diya Sharma', line1: '7, Lake View Apartments', postcode: '560038' });
    usHome = await createAddress(me.db, 'US', US_SHIPPING);
    theirs = await createAddress(other.db, 'IN', { ...IN_SHIPPING, fullName: 'Not Mine' });
  });
  afterAll(async () => {
    await Promise.all([deleteUser(me), deleteUser(other)]);
  });

  /** A placed (cash on delivery) India order, with a note from checkout. */
  async function placed() {
    const p = await pickProduct('IN', 45);
    return placeOrder(me.db, 'IN', {
      paymentMethod: 'cod',
      shipping: { ...IN_SHIPPING, instructions: 'Call on arrival' },
      buyNow: { productId: p.id, qty: 1 },
    });
  }

  it('moves it to a saved address while it is being prepared, with that address’s note', async () => {
    const order = await placed();
    const moved = await setOrderAddress(me.db, order.id, office.id);
    expect(moved.shipTo).toEqual({
      name: IN_SHIPPING.fullName,
      phone: IN_SHIPPING.phone,
      line1: '4th Floor, Embassy Tech Square',
      line2: 'Outer Ring Road, Kadubeesanahalli',
      landmark: 'Near the metro',
      city: IN_SHIPPING.city,
      state: IN_SHIPPING.state,
      postcode: '560103',
      instructions: 'Leave it at reception',
    });
    expect(moved.totals).toEqual(order.totals);
    expect(moved.status).toBe('placed');
    expect((await getOrder(me.db, order.id))?.shipTo.line1).toBe('4th Floor, Embassy Tech Square');

    // an address with no note leaves the order with none
    const again = await setOrderAddress(me.db, order.id, flat.id);
    expect(again.shipTo).toMatchObject({ name: 'Diya Sharma', line1: '7, Lake View Apartments', postcode: '560038' });
    expect(again.shipTo.instructions).toBeUndefined();
    expect(again.shipTo.landmark).toBeUndefined();
  });

  it("only to the shopper's own addresses in the order's store, and only their orders", async () => {
    const order = await placed();
    expect(await code(setOrderAddress(me.db, order.id, theirs.id))).toBe('address_not_found');
    expect(await code(setOrderAddress(me.db, order.id, usHome.id))).toBe('address_not_found');
    expect(await code(setOrderAddress(me.db, order.id, crypto.randomUUID()))).toBe('address_not_found');
    expect(await code(setOrderAddress(other.db, order.id, theirs.id))).toBe('order_not_found');
    expect((await getOrder(me.db, order.id))?.shipTo.line1).toBe(IN_SHIPPING.line1);
  });

  it('not once it has shipped', async () => {
    const order = await placed();
    const hour = 3_600_000;
    const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
    const shipped = await admin()
      .from('orders')
      .update({ shipped_at: iso(-hour), out_for_delivery_at: iso(10 * hour), delivered_at: iso(12 * hour) })
      .eq('id', order.id);
    if (shipped.error) throw shipped.error;
    expect(await code(setOrderAddress(me.db, order.id, office.id))).toBe('order_address_locked');
    expect((await getOrder(me.db, order.id))?.shipTo.line1).toBe(IN_SHIPPING.line1);
  });

  it('not for an unpaid checkout or a cancelled order', async () => {
    const p = await pickProduct('US', 60);
    const unpaid = await placeOrder(me.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
    expect(await code(setOrderAddress(me.db, unpaid.id, usHome.id))).toBe('order_address_locked');
    await cancelOrder(me.db, unpaid.id);

    const order = await placed();
    await cancelOrder(me.db, order.id);
    expect(await code(setOrderAddress(me.db, order.id, office.id))).toBe('order_address_locked');
  });

  it('signed-out callers cannot call it', async () => {
    const order = await placed();
    const res = await anon().rpc('set_my_order_address', { p_order_id: order.id, p_address_id: office.id });
    expect(res.error).not.toBeNull();
  });
});
