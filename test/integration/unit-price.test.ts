import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, getAdminProduct, updateProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { getProduct, searchCatalog } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { parseQuery } from '@/lib/search';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? [err.code, err.detail] : [String(err)];
  }
  return ['no error'];
};

const tag = crypto.randomUUID().slice(0, 6);
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Unitprice${tag} face wash`,
  brand: 'Lather',
  category: 'beauty',
  image: '/products/placeholder.jpg',
  priceMinor: 17800,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: { qty: 150, kind: 'ml' },
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  seller: 'Lather Store',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 10,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
  ...over,
});

let boss: TestUser;
let id: string;

beforeAll(async () => {
  boss = await newUser('Unit Price Admin');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  id = await createProduct(boss.db, 'IN', input());
});

afterAll(async () => {
  if (id) await admin().from('products').delete().eq('id', id);
  await deleteUser(boss);
});

describe('unit price', () => {
  it('an admin sets how much a product holds, and shoppers read it off the catalog and search', async () => {
    expect((await getAdminProduct(boss.db, id))?.unit).toEqual({ qty: 150, kind: 'ml' });
    expect((await getProduct(anon(), id))?.unit).toEqual({ qty: 150, kind: 'ml' });
    const found = await searchCatalog(anon(), 'IN', parseQuery({ k: `Unitprice${tag}` }));
    expect(found.items.map((p) => [p.id, p.unit])).toEqual([[id, { qty: 150, kind: 'ml' }]]);
  });

  it('changes and clears with the other fields, rounded to 2 decimals', async () => {
    await updateProduct(boss.db, id, input({ unit: { qty: 5.071, kind: 'fl_oz' } }));
    expect((await getProduct(anon(), id))?.unit).toEqual({ qty: 5.07, kind: 'fl_oz' });
    await updateProduct(boss.db, id, input({ unit: null }));
    expect((await getProduct(anon(), id))?.unit).toBeUndefined();
  });

  it('refuses a unit it does not know, and the database refuses half a unit', async () => {
    expect(await fail(updateProduct(boss.db, id, input({ unit: { qty: 3, kind: 'cup' as never } })))).toEqual(['invalid_input', 'unit']);
    const { error } = await admin().from('products').update({ unit_qty: 3, unit_kind: null }).eq('id', id);
    expect(error?.code).toBe('23514');
    const odd = await admin().from('products').update({ unit_qty: 3, unit_kind: 'cup' }).eq('id', id);
    expect(odd.error?.code).toBe('23514');
  });

  it('only admins write it', async () => {
    const shopper = await newUser('Unit Price Shopper');
    try {
      await shopper.db.from('products').update({ unit_qty: 1, unit_kind: 'count' }).eq('id', id);
      const { data } = await admin().from('products').select('unit_qty, unit_kind').eq('id', id).single();
      expect(data).toEqual({ unit_qty: null, unit_kind: null });
    } finally {
      await deleteUser(shopper);
    }
  });
});
