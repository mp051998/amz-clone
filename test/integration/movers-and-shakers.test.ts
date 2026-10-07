import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { moversAndShakers } from '@/lib/data/catalog';
import { placeOrder } from '@/lib/data/orders';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, setStock, stockOf, type TestUser } from './helpers';

type Move = { product_id: string; rank: number; was_rank: number | null };

let buyer: TestUser;
/** climbs: one sold last week, 60 this week */
let climber: { id: string };
/** sold only last week, 30 of them, in the climber's department */
let faded: { id: string };
/** first sold this week */
let fresh: { id: string };
let category: string;
let freshCategory: string;

const categoryOf = async (id: string) => (await admin().from('products').select('category_slug').eq('id', id).single()).data!.category_slug;

/** `qty` of a product in one IN order, placed `daysAgo` days ago; its stock is put back after. */
async function sell(productId: string, qty: number, daysAgo = 0) {
  const stock = await stockOf(productId);
  await setStock(productId, stock + qty);
  const order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING, buyNow: { productId, qty } });
  // delivered daysAgo - 3 days ago is placed daysAgo days ago
  if (daysAgo) await deliveredDaysAgo(order.id, daysAgo - 3);
  await setStock(productId, stock);
}

const movers = async (market: 'US' | 'IN', category?: string): Promise<Move[]> => {
  const { data, error } = await anon().rpc('movers_and_shakers', { p_market: market, p_limit: 100, ...(category ? { p_category: category } : {}) });
  expect(error).toBeNull();
  return data as Move[];
};

beforeAll(async () => {
  // high in the IN pool, apart from other tests' products
  [buyer, climber, fresh] = await Promise.all([newUser('Movers Buyer'), pickProduct('IN', 115), pickProduct('IN', 116)]);
  [category, freshCategory] = await Promise.all([categoryOf(climber.id), categoryOf(fresh.id)]);
  // another product of the climber's department, from the far end of the pool
  const { data } = await admin()
    .from('catalog_products')
    .select('id')
    .eq('market_id', 'IN')
    .eq('category_slug', category)
    .neq('id', climber.id)
    .gte('stock', 1)
    .order('id', { ascending: false })
    .limit(1)
    .single();
  faded = { id: data!.id! };

  await sell(faded.id, 30, 10);
  await sell(climber.id, 1, 10);
  // 60 this week (two orders of the most a line takes), well clear of other tests' sales
  await sell(climber.id, 30);
  await sell(climber.id, 30);
  await sell(fresh.id, 2);
});

afterAll(async () => {
  await deleteUser(buyer);
});

describe('movers & shakers', () => {
  it('lists a product that climbed the department’s sales ranks this week, with where it ranked before', async () => {
    const list = await movers('IN', category);
    const move = list.find((m) => m.product_id === climber.id);
    expect(move).toBeDefined();
    expect(move!.was_rank).toBeGreaterThanOrEqual(2); // the faded product outsold it last week
    expect(move!.rank).toBeLessThan(move!.was_rank!);
    // only ranks leave the database
    for (const m of list) expect(Object.keys(m).sort()).toEqual(['product_id', 'rank', 'was_rank']);
  });

  it('leaves out what didn’t sell this week, and keeps to the store', async () => {
    expect((await movers('IN', category)).map((m) => m.product_id)).not.toContain(faded.id);
    expect((await movers('US')).map((m) => m.product_id)).not.toContain(climber.id);
  });

  it('a product new to the ranks climbs from unranked', async () => {
    const move = (await movers('IN', freshCategory)).find((m) => m.product_id === fresh.id);
    expect(move).toMatchObject({ was_rank: null });
    expect(move!.rank).toBeGreaterThanOrEqual(1);
  });

  it('the chart reads the products in that order, with their ranks', async () => {
    const ranked = await movers('IN', category);
    const chart = await moversAndShakers(anon(), 'IN', { category, limit: 100 });
    expect(chart.length).toBeGreaterThan(0);
    // in the database's order (less any other options of a variant group), with its ranks
    const at = chart.map((m) => ranked.findIndex((r) => r.product_id === m.product.id));
    expect(at.every((i, n) => i >= 0 && (n === 0 || i > at[n - 1]))).toBe(true);
    for (const m of chart) expect(ranked[at[chart.indexOf(m)]]).toMatchObject({ rank: m.rank, was_rank: m.wasRank });
  });
});
