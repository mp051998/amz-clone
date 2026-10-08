import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { listBankOffers } from '@/lib/data/bank-offers';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { buildInvoice } from '@/lib/invoice';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
const BANK = `Bo${tag} Bank`;
const OTHER = `Bo${tag} Other Bank`;
const input = (n: number, priceMinor: number): ProductInput => ({
  title: `Bo${tag} pressure cooker ${n}`,
  brand: 'Hawkins',
  category: 'home-kitchen',
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
  seller: 'Hawkins Store',
  shipsFrom: 'Amazon',
  bullets: ['5 litres'],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 12,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

const HOUR = 3_600_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

// this file's offers, at banks of its own: a capped EMI one, a small one for EMI and net banking,
// and an ended and a future one that would beat both
const OFFERS = [
  { id: `bo${tag}-emi`, bank: BANK, methods: ['emi'], percent_off: 10, max_off_minor: 150000, min_spend_minor: 500000 },
  { id: `bo${tag}-small`, bank: BANK, methods: ['emi', 'netbanking'], percent_off: 5, max_off_minor: 20000, min_spend_minor: 200000 },
  { id: `bo${tag}-old`, bank: BANK, methods: ['emi', 'netbanking'], percent_off: 25, max_off_minor: 900000, min_spend_minor: 0, starts_at: at(-2 * HOUR), ends_at: at(-HOUR) },
  { id: `bo${tag}-later`, bank: BANK, methods: ['emi', 'netbanking'], percent_off: 25, max_off_minor: 900000, min_spend_minor: 0, starts_at: at(HOUR) },
];

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

let boss: TestUser;
let shopper: TestUser;
// ₹20,999, ₹8,000, ₹2,000 and ₹3,100 (just over EMI's ₹3,000 minimum)
let big: string;
let mid: string;
let cheap: string;
let edge: string;

beforeAll(async () => {
  boss = await newUser('Bo Admin');
  shopper = await newUser('Bo Shopper');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  [big, mid, cheap, edge] = await Promise.all([
    createProduct(boss.db, 'IN', input(1, 2099900)),
    createProduct(boss.db, 'IN', input(2, 800000)),
    createProduct(boss.db, 'IN', input(3, 200000)),
    createProduct(boss.db, 'IN', input(4, 310000)),
  ]);
  // the columns an offer leaves out take their defaults, not null
  const ins = await admin().from('bank_offers').insert(OFFERS.map((o) => ({ market_id: 'IN', ...o })), { defaultToNull: false });
  if (ins.error) throw ins.error;
});

afterAll(async () => {
  await deleteUser(shopper);
  await admin().from('bank_offers').delete().in('id', OFFERS.map((o) => o.id));
  // products with orders stay; take them off sale
  await admin().from('products').update({ archived_at: new Date().toISOString() }).in('id', [big, mid, cheap, edge]);
  await deleteUser(boss);
});

const buy = (productId: string, qty: number, paymentMethod: 'emi' | 'netbanking' | 'cod' | 'upi', bank?: string) =>
  placeOrder(shopper.db, 'IN', { paymentMethod, shipping: IN_SHIPPING, buyNow: { productId, qty }, ...(paymentMethod === 'emi' ? { emiMonths: 6 } : {}), ...(bank ? { bank } : {}) });

describe('Bank Offers', () => {
  it('are read by anyone, current ones only, and written by nobody but the store', async () => {
    const offers = await listBankOffers(anon(), 'IN');
    const mine = offers.filter((o) => o.bank === BANK).map((o) => o.id);
    expect(mine).toEqual([`bo${tag}-emi`, `bo${tag}-small`]);
    expect(offers.find((o) => o.id === `bo${tag}-emi`)).toEqual({ id: `bo${tag}-emi`, bank: BANK, methods: ['emi'], percentOff: 10, maxOffMinor: 150000, minSpendMinor: 500000 });
    expect((await listBankOffers(anon(), 'US')).some((o) => o.bank === BANK)).toBe(false);

    const forged = await shopper.db.from('bank_offers').insert({ id: `bo${tag}-mine`, market_id: 'IN', bank: BANK, methods: ['emi'], percent_off: 25, max_off_minor: 900000 });
    expect(forged.error).not.toBeNull();
    const raised = await shopper.db.from('bank_offers').update({ percent_off: 25 }).eq('id', `bo${tag}-small`).select('id');
    expect(raised.data ?? []).toEqual([]);
  });

  it('come off each unit for that bank and method, scaled down together under the cap', async () => {
    const plain = await buy(big, 1, 'cod');
    const one = await buy(big, 1, 'emi', BANK);
    // 10% of ₹20,999 is ₹2,099.90: capped at ₹1,500
    expect(one.totals).toMatchObject({ subtotalMinor: 2099900, discountMinor: 150000, bankOfferMinor: 150000, totalMinor: plain.totals.totalMinor - 150000 });
    expect(one.items[0]).toMatchObject({ unitDiscountMinor: 150000, unitBankMinor: 150000 });
    expect(one).toMatchObject({ status: 'placed', bank: BANK, paymentLabel: `EMI · 6 months · ${BANK}` });

    // two units at ₹8,000: ₹800 each, ₹1,600 in all, so ₹750 each
    const two = await buy(mid, 2, 'emi', BANK);
    expect(two.totals).toMatchObject({ subtotalMinor: 1600000, bankOfferMinor: 150000 });
    expect(two.items[0]).toMatchObject({ unitBankMinor: 75000 });

    // the invoice shows it apart, with the bank
    expect(buildInvoice(two)).toMatchObject({ discountMinor: 0, bankOfferMinor: 150000, bank: BANK });

    // net banking has only the small one: 5% of ₹2,000
    const nb = await buy(cheap, 1, 'netbanking', BANK);
    expect(nb.totals).toMatchObject({ discountMinor: 10000, bankOfferMinor: 10000 });
    expect(nb.paymentLabel).toBe(`Net banking · ${BANK}`);
  });

  it('take nothing under the minimum, for another bank, or for another method', async () => {
    // a bank with no offers: the bank is kept for the payment, nothing comes off
    const other = await buy(edge, 1, 'netbanking', OTHER);
    expect(other.totals.bankOfferMinor).toBeUndefined();
    expect(other).toMatchObject({ bank: OTHER, paymentLabel: `Net banking · ${OTHER}` });

    // ₹1,000: under the small one's ₹2,000 minimum
    await admin().from('products').update({ price_minor: 100000 }).eq('id', cheap);
    const below = await buy(cheap, 1, 'netbanking', BANK);
    expect(below.totals.bankOfferMinor).toBeUndefined();
    expect(below.totals.discountMinor).toBe(0);

    const upi = await buy(big, 1, 'upi', BANK);
    expect(upi.totals.bankOfferMinor).toBeUndefined();
    expect(upi.bank).toBeUndefined();
    expect(upi.paymentLabel).toBe('UPI');

    expect(await failure(buy(cheap, 1, 'netbanking', 'x'.repeat(41)))).toBe('invalid_input:bank');
  });

  it('leave EMI to the order before the offer', async () => {
    // ₹3,100 less 5% is ₹2,945, under EMI's ₹3,000, but it's the order before the offer that counts
    const o = await buy(edge, 1, 'emi', BANK);
    expect(o.totals).toMatchObject({ subtotalMinor: 310000, bankOfferMinor: 15500, totalMinor: 294500 });
  });

  it('give back what was paid when the order is cancelled', async () => {
    const o = await buy(big, 1, 'emi', BANK);
    const cancelled = await cancelOrder(shopper.db, o.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.refund?.amountMinor).toBe(o.totals.totalMinor);
    expect(cancelled.totals.bankOfferMinor).toBe(150000);
  });

  it('are served at /bank-offers and taken by POST /orders', async () => {
    const list = await import('@/app/api/v1/bank-offers/route');
    const orders = await import('@/app/api/v1/orders/route');
    const token = (await shopper.db.auth.getSession()).data.session!.access_token;
    const headers = { authorization: `Bearer ${token}`, 'x-market': 'IN', 'content-type': 'application/json' };
    const got = (await (await list.GET(new NextRequest('http://localhost/api/v1/bank-offers', { headers }), { params: Promise.resolve({}) })).json()) as { bankOffers: { id: string }[] };
    expect(got.bankOffers.map((o) => o.id)).toEqual(expect.arrayContaining([`bo${tag}-emi`, `bo${tag}-small`]));

    const res = await orders.POST(
      new NextRequest('http://localhost/api/v1/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({ paymentMethod: 'emi', emiMonths: 3, bank: BANK, buyNow: { productId: big, qty: 1 }, shipping: IN_SHIPPING }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    const { order } = (await res.json()) as { order: { bank: string; totals: { bankOfferMinor: number } } };
    expect(order).toMatchObject({ bank: BANK, totals: { bankOfferMinor: 150000 } });

    const bad = await orders.POST(
      new NextRequest('http://localhost/api/v1/orders', { method: 'POST', headers, body: JSON.stringify({ paymentMethod: 'netbanking', bank: 7, buyNow: { productId: cheap, qty: 1 }, shipping: IN_SHIPPING }) }),
      { params: Promise.resolve({}) },
    );
    expect(bad.status).toBe(422);
  });
});
