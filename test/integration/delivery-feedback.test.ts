import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliveryFeedbackFor, leaveDeliveryFeedback, removeDeliveryFeedback } from '@/lib/data/delivery-feedback';
import { DataError, unwrap } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { admin, deleteUser, deliveredDaysAgo, newUser, IN_SHIPPING, pickProduct, type TestUser } from './helpers';

let shopper: TestUser;
let other: TestUser;
let boss: TestUser;
let orderId: string;

const codeOf = async (p: PromiseLike<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
};

beforeAll(async () => {
  shopper = await newUser('Delivery Shopper');
  other = await newUser('Other Shopper');
  boss = await newUser('Delivery Admin');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  // IN offset 103 is this file's
  const { id } = await pickProduct('IN', 103);
  orderId = (await placeOrder(shopper.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: id, qty: 1 } })).id;
});

afterAll(async () => {
  await admin().from('admins').delete().eq('user_id', boss.id);
  await deleteUser(shopper);
  await deleteUser(other);
  await deleteUser(boss);
});

describe('delivery feedback', () => {
  it('opens once the order arrives', async () => {
    expect(await codeOf(leaveDeliveryFeedback(shopper.db, orderId, { positive: true }))).toBe('feedback_not_open:');
    await deliveredDaysAgo(orderId, 2);
    const left = await leaveDeliveryFeedback(shopper.db, orderId, { positive: true, reasons: ['courteous', 'on_time'] });
    expect(left).toMatchObject({ orderId, positive: true, reasons: ['on_time', 'courteous'], comment: null });
  });

  it('can be changed, with the reasons checked against the thumb', async () => {
    const changed = await leaveDeliveryFeedback(shopper.db, orderId, { positive: false, reasons: ['damaged'], comment: 'Box was crushed.' });
    expect(changed).toMatchObject({ positive: false, reasons: ['damaged'], comment: 'Box was crushed.' });
    expect(Date.parse(changed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(changed.createdAt));
    // straight to the database: a thumbs-down reason with a thumbs up
    const rpc = shopper.db.rpc('leave_delivery_feedback', { p_order_id: orderId, p_positive: true, p_reasons: ['damaged'] });
    expect(await codeOf(rpc.then(unwrap))).toBe('invalid_input:reasons');
    expect(await deliveryFeedbackFor(shopper.db, orderId)).toMatchObject({ positive: false, reasons: ['damaged'] });
  });

  it('is the shopper’s own: others can’t see or leave it, admins can read it, and nobody writes it directly', async () => {
    expect(await deliveryFeedbackFor(other.db, orderId)).toBeNull();
    expect(await codeOf(leaveDeliveryFeedback(other.db, orderId, { positive: true }))).toBe('order_not_found:');
    expect(await deliveryFeedbackFor(boss.db, orderId)).toMatchObject({ positive: false, comment: 'Box was crushed.' });
    const write = await shopper.db.from('delivery_feedback').update({ positive: true }).eq('order_id', orderId).select('order_id');
    expect(write.error ?? write.data?.length === 0).toBeTruthy();
    expect(await codeOf(removeDeliveryFeedback(other.db, orderId))).toBe('not_found:feedback');
  });

  it('closes 30 days after delivery, and can be removed', async () => {
    await deliveredDaysAgo(orderId, 31);
    expect(await codeOf(leaveDeliveryFeedback(shopper.db, orderId, { positive: true }))).toBe('feedback_not_open:');
    await removeDeliveryFeedback(shopper.db, orderId);
    expect(await deliveryFeedbackFor(shopper.db, orderId)).toBeNull();
    expect(await codeOf(removeDeliveryFeedback(shopper.db, orderId))).toBe('not_found:feedback');
  });
});
