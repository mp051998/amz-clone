import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { cancelPendingOrder, placeOrder } from '@/lib/data/orders';
import type { Order } from '@/lib/types';
import { admin, deleteUser, newUser, pickProduct, setStock, stockOf, US_SHIPPING, type TestUser } from './helpers';

describe('confirming a card payment again', () => {
  let buyer: TestUser;
  beforeAll(async () => {
    buyer = await newUser('Second Confirm');
  });
  afterAll(async () => {
    await deleteUser(buyer);
  });

  /** An unpaid card order for one unit of the product at `offset`. */
  async function cardOrder(offset: number) {
    const p = await pickProduct('US', offset);
    await buyer.db.rpc('cart_clear', { p_market: 'US' });
    await setCartQty(buyer.db, 'US', p.id, 1);
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING });
    return { p, order, session: `cs_test_${crypto.randomUUID()}` };
  }
  const confirm = (order: Order, session: string) =>
    admin().rpc('confirm_order_payment', {
      p_order_id: order.id,
      p_session_id: session,
      p_amount_minor: order.totals.totalMinor,
      p_currency: order.currency,
      p_payment_label: 'Visa ending 4242',
    });
  const row = async (id: string) =>
    (await admin().from('orders').select('status, placed_at, cancelled_at, refund_status, refund_minor').eq('id', id).single()).data!;

  it('a paid order that was cancelled and refunded stays cancelled', async () => {
    const { p, order, session } = await cardOrder(49);
    expect((await confirm(order, session)).error).toBeNull();
    const cancel = await buyer.db.rpc('cancel_my_order', { p_order_id: order.id });
    expect(cancel.error).toBeNull();
    const after = await row(order.id);
    expect(after).toMatchObject({ status: 'cancelled', refund_status: 'pending', refund_minor: order.totals.totalMinor });
    const stock = await stockOf(p.id);

    // the success page reopened, or Stripe sending checkout.session.completed again
    const again = await confirm(order, session);
    expect(again.error).toBeNull();
    expect((again.data as { status: string }).status).toBe('cancelled');
    expect(await row(order.id)).toEqual(after);
    expect(await stockOf(p.id)).toBe(stock);
  });

  it('a late payment for an abandoned checkout still places it', async () => {
    const { p, order, session } = await cardOrder(50);
    const reserved = await stockOf(p.id);
    expect((await cancelPendingOrder(buyer.db, order.id)).status).toBe('cancelled');
    expect(await stockOf(p.id)).toBe(reserved + 1);

    const paid = await confirm(order, session);
    expect(paid.error).toBeNull();
    expect((paid.data as { status: string }).status).toBe('placed');
    expect(await stockOf(p.id)).toBe(reserved);
  });

  it('an order marked sold out stays cancelled once the stock is back', async () => {
    const { p, order, session } = await cardOrder(51);
    const reserved = await stockOf(p.id);
    expect((await cancelPendingOrder(buyer.db, order.id)).status).toBe('cancelled');
    await setStock(p.id, 0);
    try {
      expect((await confirm(order, session)).error?.message).toBe('stock_released');
      expect((await admin().rpc('mark_sold_out', { p_order_id: order.id })).error).toBeNull();
      expect(await row(order.id)).toMatchObject({ status: 'cancelled', refund_status: 'pending' });

      await setStock(p.id, reserved + 1);
      const again = await confirm(order, session);
      expect(again.error).toBeNull();
      expect((again.data as { status: string }).status).toBe('cancelled');
      expect(await stockOf(p.id)).toBe(reserved + 1);
    } finally {
      await setStock(p.id, reserved + 1);
    }
  });
});
