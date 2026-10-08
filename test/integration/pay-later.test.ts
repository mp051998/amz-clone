import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { createCategory } from '@/lib/data/admin-categories';
import { receiveReturn } from '@/lib/data/admin-returns';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { activatePayLater, listPayLaterRepayments, payLater, repayPayLater, type RepayMethod } from '@/lib/data/pay-later';
import { requestReturn } from '@/lib/data/returns';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, type TestUser } from './helpers';

/** What a call failed with, as `code:detail` (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

const tag = crypto.randomUUID().slice(0, 6);
let boss: TestUser;
let shopper: TestUser;
// the test's own amazon.in category and a ₹5,000 product in it
let category = '';
let product = '';
const PRICE = 500_000;

const item = (priceMinor: number): ProductInput => ({
  title: `Pay Later test ${tag}`,
  brand: null,
  category,
  image: '/products/placeholder.jpg',
  priceMinor,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  boughtPastMonth: null,
  seller: 'Test Seller',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  // under pickProduct's 25, so other tests never pick it
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

const buy = (qty = 1) => placeOrder(shopper.db, 'IN', { paymentMethod: 'paylater', shipping: IN_SHIPPING, buyNow: { productId: product, qty } });

/** Today in India: the year, the month (01–12) and the day. */
function indiaToday(): { y: string; m: string; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-');
  return { y, m, d: Number(d) };
}

beforeAll(async () => {
  [boss, shopper] = await Promise.all([newUser('Pay Later Admin'), newUser('Pay Later Shopper')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  category = await createCategory(boss.db, { name: `Pay Later ${tag}` }, 'IN');
  product = await createProduct(boss.db, 'IN', item(PRICE));
});

afterAll(async () => {
  await deleteUser(shopper);
  if (product) await admin().from('products').delete().eq('id', product);
  if (category) {
    await admin().from('market_categories').delete().eq('category_slug', category);
    await admin().from('categories').delete().eq('slug', category);
  }
  await deleteUser(boss);
});

describe('Pay Later (amazon.in)', () => {
  it('is offered in India, with a ₹60,000 limit, and not in the US', async () => {
    const { data } = await admin().from('markets').select('id, pay_later_limit_minor, payment_methods').order('id');
    expect(data?.map((m) => [m.id, m.pay_later_limit_minor, m.payment_methods.includes('paylater')])).toEqual([
      ['IN', 6_000_000, true],
      ['US', null, false],
    ]);
  });

  it('refuses Pay Later orders before it’s activated, and activating in the US', async () => {
    expect(await payLater(shopper.db)).toBeNull();
    expect(await failure(buy())).toBe('pay_later_inactive:');
    expect(await failure(activatePayLater(shopper.db, 'US'))).toBe('pay_later_unavailable:');
    expect(await payLater(shopper.db)).toBeNull();
  });

  it('activates with the store’s limit, once', async () => {
    const account = await activatePayLater(shopper.db, 'IN');
    expect(account).toMatchObject({ market: 'IN', limitMinor: 6_000_000, usedMinor: 0, availableMinor: 6_000_000, billMinor: 0, unbilledMinor: 0, overdue: false });
    expect(account.dueOn).toBeUndefined();
    const again = await activatePayLater(shopper.db, 'IN');
    expect(again.activatedAt).toBe(account.activatedAt);
  });

  it('places an order on Pay Later, using up the limit, and a cancelled order frees it', async () => {
    const order = await buy(2);
    expect(order).toMatchObject({ status: 'placed', paymentMethod: 'paylater', paymentLabel: 'Pay Later' });
    expect(order.totals.totalMinor).toBe(2 * PRICE);
    expect(await payLater(shopper.db)).toMatchObject({ usedMinor: 2 * PRICE, unbilledMinor: 2 * PRICE, availableMinor: 6_000_000 - 2 * PRICE, billMinor: 0 });

    const cancelled = await cancelOrder(shopper.db, order.id);
    expect(cancelled.refund).toMatchObject({ status: 'succeeded', amountMinor: 2 * PRICE });
    expect(await payLater(shopper.db)).toMatchObject({ usedMinor: 0, availableMinor: 6_000_000 });
  });

  it('refunds a return to Pay Later, never to the balance', async () => {
    const order = await buy();
    await deliveredDaysAgo(order.id, 1);
    expect(await failure(requestReturn(shopper.db, order.id, { items: [{ productId: product, qty: 1 }], reason: 'no_longer_needed', refundTo: 'balance' }))).toBe('invalid_input:refundTo');
    const ret = await requestReturn(shopper.db, order.id, { items: [{ productId: product, qty: 1 }], reason: 'no_longer_needed' });
    expect(ret.refundMinor).toBeGreaterThan(0);
    const got = await receiveReturn(boss.db, ret.id);
    expect(got.refund?.status).toBe('succeeded');
    expect((await payLater(shopper.db))?.usedMinor).toBe(PRICE - ret.refundMinor);
  });

  it('takes repayments of up to what’s owed, by UPI or net banking', async () => {
    const before = (await payLater(shopper.db))!.usedMinor;
    await buy();
    const owed = before + PRICE;
    expect((await payLater(shopper.db))?.usedMinor).toBe(owed);
    expect(await failure(repayPayLater(shopper.db, owed + 1, 'upi'))).toBe('invalid_input:amount');
    expect(await failure(repayPayLater(shopper.db, 0, 'upi'))).toBe('invalid_input:amount');
    expect(await failure(repayPayLater(shopper.db, 100, 'card' as RepayMethod))).toBe('invalid_input:method');

    const after = await repayPayLater(shopper.db, 100_000, 'netbanking', 'HDFC Bank');
    expect(after).toMatchObject({ usedMinor: owed - 100_000, availableMinor: 6_000_000 - (owed - 100_000) });
    expect(await listPayLaterRepayments(shopper.db)).toEqual([expect.objectContaining({ amountMinor: 100_000, method: 'netbanking', bank: 'HDFC Bank' })]);
  });

  it('bills what was bought before the 1st, due on the 5th, and refuses Pay Later while the bill is overdue', async () => {
    // the latest order, bought last month
    const { y, m, d } = indiaToday();
    const billedAt = new Date(`${y}-${m}-01T00:00:00+05:30`);
    const { data: latest } = await admin().from('orders').select('id, total_minor').eq('user_id', shopper.id).eq('payment_method', 'paylater').order('created_at', { ascending: false }).limit(1).single();
    await admin().from('orders').update({ created_at: new Date(billedAt.getTime() - 3 * 86_400_000).toISOString() }).eq('id', latest!.id);

    const billed = await payLater(shopper.db);
    // the repayment went against it, the oldest purchase
    const bill = latest!.total_minor - 100_000;
    expect(billed).toMatchObject({ billMinor: bill, dueOn: `${y}-${m}-05`, overdue: d > 5 });
    expect(billed!.unbilledMinor).toBe(billed!.usedMinor - bill);

    if (d > 5) expect(await failure(buy())).toBe('pay_later_overdue:');
    const paid = await repayPayLater(shopper.db, bill, 'upi');
    expect(paid).toMatchObject({ billMinor: 0, overdue: false });
    expect(paid.dueOn).toBeUndefined();
    expect(await buy()).toMatchObject({ paymentMethod: 'paylater' });
  });

  it('refuses an order the available limit doesn’t cover', async () => {
    const { usedMinor } = (await payLater(shopper.db))!;
    await admin().from('pay_later_accounts').update({ limit_minor: usedMinor + PRICE - 1 }).eq('user_id', shopper.id);
    expect(await failure(buy())).toBe(`pay_later_limit:${PRICE - 1}`);
  });

  it('is written only through its functions', async () => {
    const rows = await shopper.db.from('pay_later_accounts').select('user_id');
    expect(rows.data).toEqual([{ user_id: shopper.id }]);
    expect((await shopper.db.from('pay_later_accounts').update({ limit_minor: 99_999_999 }).eq('user_id', shopper.id).select()).data ?? []).toEqual([]);
    expect((await shopper.db.from('pay_later_repayments').insert({ user_id: shopper.id, amount_minor: 1, method: 'upi' })).error).not.toBeNull();
    const { data } = await admin().from('pay_later_accounts').select('limit_minor').eq('user_id', shopper.id).single();
    expect(data?.limit_minor).not.toBe(99_999_999);
  });
});
