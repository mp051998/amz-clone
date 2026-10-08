import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { placeOrder } from '@/lib/data/orders';
import { getOrderReturns } from '@/lib/data/returns';
import { holidayReturnBy } from '@/lib/holiday-returns';
import { MARKETS } from '@/lib/marketplace';
import { admin, deleteUser, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const DAY = 86_400_000;

/** Placed on `placed` (ISO), shipped the next day and delivered the day after that. */
async function boughtOn(orderId: string, placed: string): Promise<number> {
  const at = Date.parse(placed);
  const iso = (ms: number) => new Date(ms).toISOString();
  const { error } = await admin()
    .from('orders')
    .update({ placed_at: iso(at), shipped_at: iso(at + DAY), out_for_delivery_at: iso(at + 2 * DAY - 60_000), delivered_at: iso(at + 2 * DAY) })
    .eq('id', orderId);
  if (error) throw error;
  return at + 2 * DAY;
}

let buyer: TestUser;
let us: { id: string };
let inProduct: { id: string };

beforeAll(async () => {
  [buyer, us, inProduct] = await Promise.all([newUser('Holiday Returns Buyer'), pickProduct('US', 92), pickProduct('IN', 92)]);
});

afterAll(async () => {
  await deleteUser(buyer);
});

describe('holiday returns', () => {
  it('the stores have them as configured', async () => {
    const { data, error } = await admin().from('markets').select('id, holiday_returns');
    if (error) throw error;
    const on = Object.fromEntries(data.map((m) => [m.id, m.holiday_returns]));
    expect(on).toEqual({ US: MARKETS.US.returns.holiday === true, IN: MARKETS.IN.returns.holiday === true });
    expect(on).toEqual({ US: true, IN: false });
  });

  it('a US order placed in December goes back until January 31', async () => {
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: us.id, qty: 1 } });
    expect(order.items[0].returnDays).toBeUndefined();
    const delivered = await boughtOn(order.id, '2025-12-10T18:00:00Z');

    const r = (await getOrderReturns(buyer.db, order.id))!;
    // the end of January 31 in Seattle, not 30 days after delivery (January 11)
    expect(Date.parse(r.returnBy!)).toBe(Date.parse('2026-02-01T07:59:59Z'));
    expect(Date.parse(r.returnBy!)).toBeGreaterThan(delivered + 30 * DAY);
    expect(Date.parse(r.returnByItem[us.id])).toBe(Date.parse('2026-02-01T07:59:59Z'));
    expect(r.returnable[us.id]).toBe(0);

    // an October one keeps its 30 days
    await boughtOn(order.id, '2025-10-10T18:00:00Z');
    const october = (await getOrderReturns(buyer.db, order.id))!;
    expect(Date.parse(october.returnBy!)).toBe(Date.parse('2025-10-12T18:00:00Z') + 30 * DAY);
  });

  it('an India order keeps its own window', async () => {
    const order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING, buyNow: { productId: inProduct.id, qty: 1 } });
    const days = order.items[0].returnDays ?? MARKETS.IN.returns.days;
    const delivered = await boughtOn(order.id, '2025-12-10T06:00:00Z');
    const r = (await getOrderReturns(buyer.db, order.id))!;
    expect(Date.parse(r.returnByItem[inProduct.id])).toBe(delivered + days * DAY);
  });

  it('GET /products/:id says until when one bought now can go back', async () => {
    const item = await import('@/app/api/v1/products/[id]/route');
    const get = async (market: 'US' | 'IN', id: string) =>
      (await (
        await item.GET(new NextRequest(`http://localhost/api/v1/products/${id}`, { headers: { 'x-market': market } }), { params: Promise.resolve({ id }) })
      ).json()) as { holidayReturnBy: string | null };
    // in season (November and December) the end of January 31, else null
    expect((await get('US', us.id)).holidayReturnBy).toBe(holidayReturnBy(MARKETS.US, new Date())?.toISOString() ?? null);
    expect((await get('IN', inProduct.id)).holidayReturnBy).toBeNull();
  });
});
