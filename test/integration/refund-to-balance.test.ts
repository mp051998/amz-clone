import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { receiveReturn } from '@/lib/data/admin-returns';
import { storeBalance } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { refundReturn, type RefundStripe } from '@/lib/data/refunds';
import { requestReturn } from '@/lib/data/returns';
import type { PaymentMethod } from '@/lib/types';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, type TestUser } from './helpers';

/** What a call failed with, as `code:detail` (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

let buyer: TestUser;
let boss: TestUser;
let card: { id: string };
let upi: { id: string };
let wallet: { id: string };

beforeAll(async () => {
  // high in the IN pool, apart from other tests' products
  [buyer, boss, card, upi, wallet] = await Promise.all([
    newUser('Balance Refund Buyer'),
    newUser('Balance Refund Admin'),
    pickProduct('IN', 112),
    pickProduct('IN', 113),
    pickProduct('IN', 114),
  ]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(boss)]);
});

/** A delivered IN order of `qty` of one product. */
async function delivered(method: PaymentMethod, productId: string, qty = 2) {
  const order = await placeOrder(buyer.db, 'IN', { paymentMethod: method, shipping: IN_SHIPPING, buyNow: { productId, qty } });
  if (method === 'card') {
    // paid on Stripe (as the webhook would record it)
    const svc = admin();
    await svc.from('orders').update({ status: 'placed', placed_at: new Date().toISOString() }).eq('id', order.id);
    await svc.rpc('record_payment_intent', { p_order_id: order.id, p_payment_intent: 'pi_fake' });
  }
  await deliveredDaysAgo(order.id, 1);
  return order;
}

const refundEntries = async (returnId: string) =>
  (await admin().from('balance_entries').select('kind, amount_minor').eq('return_id', returnId)).data ?? [];

const noStripe: RefundStripe = {
  refunds: {
    list: async () => { throw new Error('Stripe asked'); },
    create: async () => { throw new Error('Stripe asked'); },
  },
  checkout: { sessions: { retrieve: async () => { throw new Error('Stripe asked'); } } },
};

describe('refunding a return to the balance', () => {
  it('pays a card order’s refund onto the balance as soon as it’s received, with nothing asked of Stripe', async () => {
    const order = await delivered('card', card.id);
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: card.id, qty: 1 }], reason: 'better_price', refundTo: 'balance' });
    expect(r).toMatchObject({ status: 'requested', refundToBalance: true });
    expect(r.refundMinor).toBeGreaterThan(0);

    const before = (await storeBalance(buyer.db, 'IN')) ?? 0;
    const got = await receiveReturn(boss.db, r.id);
    expect(got).toMatchObject({ status: 'received', refundToBalance: true, refund: { status: 'succeeded' } });
    expect(got.refund?.refundedAt).toBeTruthy();
    expect(await storeBalance(buyer.db, 'IN')).toBe(before + r.refundMinor);
    expect(await refundEntries(r.id)).toEqual([{ kind: 'refund', amount_minor: r.refundMinor }]);
    expect(await refundReturn(r.id, { db: admin(), stripe: noStripe })).toBe('succeeded');
  });

  it('leaves a refund to how they paid where it was', async () => {
    const order = await delivered('upi', upi.id);
    const toBalance = await requestReturn(buyer.db, order.id, { items: [{ productId: upi.id, qty: 1 }], reason: 'no_longer_needed', refundTo: 'balance' });
    const back = await requestReturn(buyer.db, order.id, { items: [{ productId: upi.id, qty: 1 }], reason: 'no_longer_needed', refundTo: 'original' });
    expect(back.refundToBalance).toBeUndefined();

    const before = (await storeBalance(buyer.db, 'IN')) ?? 0;
    await receiveReturn(boss.db, back.id);
    expect(await storeBalance(buyer.db, 'IN')).toBe(before);
    expect(await refundEntries(back.id)).toEqual([]);
    await receiveReturn(boss.db, toBalance.id);
    expect(await storeBalance(buyer.db, 'IN')).toBe(before + toBalance.refundMinor);
  });

  it('a balance order goes back to the balance once; a replacement has nothing to refund', async () => {
    const order = await delivered('amazonpay', wallet.id);
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: wallet.id, qty: 1 }], reason: 'better_price', refundTo: 'balance' });
    expect(r.refundToBalance).toBeUndefined();
    const before = (await storeBalance(buyer.db, 'IN')) ?? 0;
    await receiveReturn(boss.db, r.id);
    expect(await storeBalance(buyer.db, 'IN')).toBe(before + r.refundMinor);
    expect(await refundEntries(r.id)).toHaveLength(1);

    const upiOrder = await delivered('upi', upi.id, 1);
    const swap = await buyer.db.rpc('request_return', {
      p_order_id: upiOrder.id,
      p_items: [{ product_id: upi.id, qty: 1 }],
      p_reason: 'damaged',
      p_resolution: 'replacement',
      p_refund_to: 'balance',
    });
    expect(swap.error).toBeNull();
    expect(swap.data).toMatchObject({ resolution: 'replacement', refund_to: 'original' });
  });

  it('turns down anywhere else', async () => {
    const order = await delivered('upi', upi.id, 1);
    const res = await buyer.db.rpc('request_return', {
      p_order_id: order.id,
      p_items: [{ product_id: upi.id, qty: 1 }],
      p_reason: 'better_price',
      p_refund_to: 'bank',
    });
    expect([res.error?.message, res.error?.details]).toEqual(['invalid_input', 'refund_to']);
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: upi.id, qty: 1 }], reason: 'better_price', refundTo: 'bank' }))).toBe(
      'invalid_input:refundTo',
    );
  });
});
