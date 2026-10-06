import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, getOrder, placeOrder, setOrderInstructions } from '@/lib/data/orders';
import { admin, deleteUser, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe("changing an order's delivery instructions", () => {
  let me: TestUser;
  let other: TestUser;
  beforeAll(async () => {
    [me, other] = await Promise.all([newUser('Note Changer'), newUser('Someone Else')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(me), deleteUser(other)]);
  });

  /** A placed (cash on delivery) India order, with a note from checkout. */
  async function placed() {
    const p = await pickProduct('IN', 35);
    return placeOrder(me.db, 'IN', {
      paymentMethod: 'cod',
      shipping: { ...IN_SHIPPING, instructions: 'Call on arrival' },
      buyNow: { productId: p.id, qty: 1 },
    });
  }

  it('changes and removes them while the order is being prepared', async () => {
    const order = await placed();
    expect(order.shipTo.instructions).toBe('Call on arrival');

    const changed = await setOrderInstructions(me.db, order.id, '  Leave it with the guard\r\nBlock C  ');
    expect(changed.shipTo.instructions).toBe('Leave it with the guard\nBlock C');
    expect((await getOrder(me.db, order.id))?.shipTo.instructions).toBe('Leave it with the guard\nBlock C');

    const cleared = await setOrderInstructions(me.db, order.id, '   ');
    expect(cleared.shipTo.instructions).toBeUndefined();
    expect(cleared.status).toBe('placed');
  });

  it('still on its way (shipped), but not once it is out for delivery', async () => {
    const order = await placed();
    const hour = 3_600_000;
    const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
    const svc = admin();
    const shipped = await svc
      .from('orders')
      .update({ shipped_at: iso(-hour), out_for_delivery_at: iso(10 * hour), delivered_at: iso(12 * hour) })
      .eq('id', order.id);
    if (shipped.error) throw shipped.error;
    expect((await setOrderInstructions(me.db, order.id, 'Ring twice')).shipTo.instructions).toBe('Ring twice');

    const out = await svc.from('orders').update({ out_for_delivery_at: iso(-60_000) }).eq('id', order.id);
    if (out.error) throw out.error;
    expect(await code(setOrderInstructions(me.db, order.id, 'Too late'))).toBe('order_not_editable');
    expect((await getOrder(me.db, order.id))?.shipTo.instructions).toBe('Ring twice');
  });

  it('not for an unpaid checkout or a cancelled order', async () => {
    const p = await pickProduct('US', 55);
    const unpaid = await placeOrder(me.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
    expect(await code(setOrderInstructions(me.db, unpaid.id, 'Back door'))).toBe('order_not_editable');
    await cancelOrder(me.db, unpaid.id);

    const order = await placed();
    await cancelOrder(me.db, order.id);
    expect(await code(setOrderInstructions(me.db, order.id, 'Back door'))).toBe('order_not_editable');
  });

  it("only the shopper's own orders, and no longer than 250 characters", async () => {
    const order = await placed();
    expect(await code(setOrderInstructions(other.db, order.id, 'Mine now'))).toBe('order_not_found');
    // the database holds the line too
    const res = await me.db.rpc('set_my_order_instructions', { p_order_id: order.id, p_instructions: 'x'.repeat(251) });
    expect(res.error?.message).toBe('invalid_input');
    expect((await getOrder(me.db, order.id))?.shipTo.instructions).toBe('Call on arrival');
  });
});
