import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { archiveOrder, cancelOrder, getOrder, listOrders, placeOrder } from '@/lib/data/orders';
import { deleteUser, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('archiving an order', () => {
  let me: TestUser;
  let other: TestUser;
  beforeAll(async () => {
    [me, other] = await Promise.all([newUser('Tidy Shopper'), newUser('Someone Else')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(me), deleteUser(other)]);
  });

  /** A placed (cash on delivery) India order for one unit. */
  async function placed() {
    const p = await pickProduct('IN', 33);
    return placeOrder(me.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
  }

  it('archives an order and brings it back, keeping it in the list either way', async () => {
    const order = await placed();
    expect(order.archivedAt).toBeUndefined();

    const archived = await archiveOrder(me.db, order.id, true);
    expect(archived.archivedAt).toBeTruthy();
    expect(archived.status).toBe('placed');
    const listed = (await listOrders(me.db, 'IN')).find((o) => o.id === order.id);
    expect(listed?.archivedAt).toBe(archived.archivedAt);

    // archiving again keeps the first time
    expect((await archiveOrder(me.db, order.id, true)).archivedAt).toBe(archived.archivedAt);

    const back = await archiveOrder(me.db, order.id, false);
    expect(back.archivedAt).toBeUndefined();
    expect((await getOrder(me.db, order.id))?.archivedAt).toBeUndefined();
  });

  it('an archived order can still be cancelled', async () => {
    const order = await placed();
    await archiveOrder(me.db, order.id, true);
    const cancelled = await cancelOrder(me.db, order.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.archivedAt).toBeTruthy();
  });

  it('an unpaid card checkout cannot be archived', async () => {
    const p = await pickProduct('US', 53);
    const unpaid = await placeOrder(me.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
    expect(unpaid.status).toBe('awaiting_payment');
    expect(await code(archiveOrder(me.db, unpaid.id, true))).toBe('order_not_archivable');
    // nothing to bring back, but that's harmless
    expect((await archiveOrder(me.db, unpaid.id, false)).archivedAt).toBeUndefined();
    await cancelOrder(me.db, unpaid.id);
  });

  it("only the shopper's own orders", async () => {
    const order = await placed();
    expect(await code(archiveOrder(other.db, order.id, true))).toBe('order_not_found');
    expect((await getOrder(me.db, order.id))?.archivedAt).toBeUndefined();
  });
});
