import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/v1/products/[id]/route';
import { typicalPrice } from '@/lib/data/typical-price';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

/** This file's own product (24 in stock, so pickProduct() never picks it), removed at the end. */
const id = `zz-typical-price-${crypto.randomUUID().slice(0, 8)}`;
const DAY = 86_400_000;

let shopper: TestUser;

const history = async () => {
  const { data, error } = await admin().from('price_history').select('price_minor, at').eq('product_id', id).order('at');
  if (error) throw error;
  return data;
};
const reprice = async (fields: { stock?: number; price_minor?: number; list_minor?: number }) => {
  const { error } = await admin().from('products').update(fields).eq('id', id);
  if (error) throw error;
};
const fromApi = async () => {
  const token = (await shopper.db.auth.getSession()).data.session!.access_token;
  const res = await GET(new NextRequest(`http://localhost/api/v1/products/${id}`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ id }) });
  expect(res.status).toBe(200);
  return (await res.json()).typicalPriceMinor as number | null;
};

beforeAll(async () => {
  const { data: like, error } = await admin()
    .from('products')
    .select('category_slug, seller, ships_from, image')
    .eq('market_id', 'US')
    .is('variant_group', null)
    .is('archived_at', null)
    .order('id')
    .limit(1)
    .single();
  if (error) throw error;
  const made = await admin().from('products').insert({ id, market_id: 'US', ...like, title: 'Typical price test', price_minor: 2500, stock: 24, position: 900_300 });
  if (made.error) throw made.error;
  shopper = await newUser('Typical Shopper');
});

afterAll(async () => {
  await deleteUser(shopper);
  await admin().from('products').delete().eq('id', id);
});

describe('typical price', () => {
  it('records a new product’s price, and a repricing but not a stock change', async () => {
    expect((await history()).map((h) => h.price_minor)).toEqual([2500]);
    await reprice({ stock: 23 });
    expect(await history()).toHaveLength(1);
    // shoppers can't read the history itself
    const { error } = await anon().from('price_history').select('price_minor').eq('product_id', id);
    expect(error).not.toBeNull();
  });

  it('needs a week of prices', async () => {
    expect(await typicalPrice(anon(), id)).toBeNull();
    expect(await fromApi()).toBeNull();
  });

  it('is the median daily price over 90 days, shown once the price is below it', async () => {
    // as if it had been $25.00 for the last month
    const { error } = await admin()
      .from('price_history')
      .update({ at: new Date(Date.now() - 30 * DAY).toISOString() })
      .eq('product_id', id);
    if (error) throw error;
    expect(await typicalPrice(anon(), id)).toBe(2500);
    expect(await fromApi()).toBeNull(); // not below it yet

    await reprice({ price_minor: 1999 });
    expect((await history()).map((h) => h.price_minor)).toEqual([2500, 1999]);
    expect(await typicalPrice(anon(), id)).toBe(2500);
    expect(await fromApi()).toBe(2500);
  });

  it('a list price above the price takes its place', async () => {
    await reprice({ list_minor: 2999 });
    expect(await fromApi()).toBeNull();
  });
});
