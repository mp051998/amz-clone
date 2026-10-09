import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { addToCart, buyNowQuote, getCart } from '@/lib/data/cart';
import { getProduct } from '@/lib/data/catalog';
import { lightningDealsFor } from '@/lib/data/lightning-deals';
import { placeOrder } from '@/lib/data/orders';
import { joinPlus } from '@/lib/data/plus';
import { admin, anon, deleteUser, newUser, US_SHIPPING, type TestUser } from './helpers';

const MIN = 60_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

const tag = crypto.randomUUID().slice(0, 6);
const input = (n: number): ProductInput => ({
  title: `Earlydeal${tag} kettle ${n}`,
  brand: 'Boilwell',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 5000,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  seller: 'Boilwell Store',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

let boss: TestUser;
let shopper: TestUser;
let member: TestUser;
let soon: string; // a deal starting in 20 minutes: open to members
let later: string; // one starting in 3 hours: not yet
const deals: Record<string, string> = {};

/** A deal on `product` at $35.00 (service role, as the store's plan does). */
async function addDeal(product: string, startsIn: number, quota: number) {
  const { data, error } = await admin()
    .from('lightning_deals')
    .insert({ product_id: product, market_id: 'US', deal_price_minor: 3500, quota, starts_at: at(startsIn), ends_at: at(startsIn + 60 * MIN) })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

const dealRow = async (id: string) => {
  const { data, error } = await admin().from('lightning_deals').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

const buy = (u: TestUser, product: string, qty: number) => placeOrder(u.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: product, qty } });

beforeAll(async () => {
  boss = await newUser('Early Deal Admin');
  shopper = await newUser('Early Deal Shopper');
  member = await newUser('Early Deal Member');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  soon = await createProduct(boss.db, 'US', input(1));
  later = await createProduct(boss.db, 'US', input(2));
  deals[soon] = await addDeal(soon, 20 * MIN, 3);
  deals[later] = await addDeal(later, 180 * MIN, 3);
  await joinPlus(member.db, 'US', 'annual');
});

afterAll(async () => {
  await deleteUser(shopper);
  await deleteUser(member);
  for (const id of [soon, later]) if (id) await admin().from('products').delete().eq('id', id);
  await deleteUser(boss);
});

describe('Plus early access to Lightning Deals', () => {
  it('says when it opens, half an hour before the deal', async () => {
    const d = (await lightningDealsFor(anon(), [soon])).get(soon)!;
    expect(d.state).toBe('upcoming');
    expect(Date.parse(d.startsAt) - Date.parse(d.earlyAccessAt)).toBe(30 * MIN);
  });

  it('costs anyone but a member the full price, and claims nothing', async () => {
    const q = await buyNowQuote(shopper.db, 'US', soon, 1);
    expect(q.lines[0].earlyAccessMinor).toBeUndefined();
    expect(q.totals.discountMinor ?? 0).toBe(0);
    const placed = await buy(shopper, soon, 1);
    expect(placed.items[0].unitMemberMinor).toBeUndefined();
    expect((await dealRow(deals[soon])).claimed).toBe(0);
  });

  it('isn’t open yet more than half an hour before the start', async () => {
    const q = await buyNowQuote(member.db, 'US', later, 1);
    expect(q.lines[0].earlyAccessMinor).toBeUndefined();
    expect(q.totals.memberMinor).toBeUndefined();
  });

  it('prices a member’s cart at the deal price, as a member saving', async () => {
    await addToCart(member.db, 'US', soon, 2);
    const cart = await getCart(member.db, 'US');
    const line = cart.lines.find((l) => l.product.id === soon)!;
    // $50.00 down to $35.00 on each
    expect(line).toMatchObject({ lineTotalMinor: 10000, discountMinor: 3000, memberMinor: 3000, earlyAccessMinor: 3000 });
    expect(cart.totals).toMatchObject({ discountMinor: 3000, memberMinor: 3000 });
    // the product keeps its price for everyone until the deal starts
    expect((await getProduct(anon(), soon))?.priceMinor).toBe(5000);
  });

  it('claims what a member orders against the deal, which can sell out before it starts', async () => {
    const placed = await placeOrder(member.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    const item = placed.items.find((i) => i.productId === soon)!;
    expect(item).toMatchObject({ qty: 2, unitPriceMinor: 5000, unitMemberMinor: 1500, unitDiscountMinor: 1500 });
    expect(placed.totals.memberMinor).toBe(3000);
    expect(await dealRow(deals[soon])).toMatchObject({ claimed: 2, started_at: null, ended_at: null });
    expect((await lightningDealsFor(anon(), [soon])).get(soon)).toMatchObject({ state: 'upcoming', claimed: 2 });

    await buy(member, soon, 1);
    expect(await dealRow(deals[soon])).toMatchObject({ claimed: 3, started_at: null, end_reason: 'sold_out' });
    expect((await lightningDealsFor(anon(), [soon])).get(soon)?.state).toBe('sold_out');
    // gone: the next order is at the full price
    const q = await buyNowQuote(member.db, 'US', soon, 1);
    expect(q.lines[0].earlyAccessMinor).toBeUndefined();
    expect(q.totals.discountMinor ?? 0).toBe(0);
  });
});
