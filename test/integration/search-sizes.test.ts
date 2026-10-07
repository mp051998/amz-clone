import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { searchCatalog } from '@/lib/data/catalog';
import { parseQuery } from '@/lib/search';
import { admin, anon, pickProduct } from './helpers';

// sizes no other product comes in, so other files' sized products don't show up here
const ONE = 'SF 1';
const TWO = 'SF 2';

let a: { id: string; group: string; dept: string };
let b: { id: string; group: string; dept: string };

const setSizes = async (id: string, sizes: string[] | null) => {
  const { error } = await admin().from('products').update({ sizes }).eq('id', id);
  if (error) throw error;
};

const product = async (offset: number) => {
  const { id } = await pickProduct('IN', offset);
  const { data, error } = await admin().from('products').select('id, variant_group, category_slug').eq('id', id).single();
  if (error) throw error;
  return { id, group: data.variant_group ?? id, dept: data.category_slug };
};

const facet = (facets: { name: string; count: number }[], name: string) => facets.find((f) => f.name === name)?.count;

beforeAll(async () => {
  // IN offsets 109 and 111 are this file's
  [a, b] = await Promise.all([product(109), product(111)]);
  await setSizes(a.id, [ONE, TWO]);
  await setSizes(b.id, [TWO]);
});

afterAll(async () => {
  await setSizes(a.id, null);
  await setSizes(b.id, null);
});

describe('search by size', () => {
  it('has size facets over the scope, each variant group once', async () => {
    const all = await searchCatalog(anon(), 'IN', parseQuery({}));
    expect(facet(all.sizeFacets, ONE)).toBe(1);
    expect(facet(all.sizeFacets, TWO)).toBe(new Set([a.group, b.group]).size);

    // a department's facets hold only its own products' sizes
    const dept = await searchCatalog(anon(), 'IN', parseQuery({ dept: a.dept }));
    expect(facet(dept.sizeFacets, ONE)).toBe(1);
    if (a.dept !== b.dept) expect(facet(dept.sizeFacets, TWO)).toBe(1);

    // the other store has none of them
    const us = await searchCatalog(anon(), 'US', parseQuery({}));
    expect(facet(us.sizeFacets, ONE)).toBeUndefined();
  });

  it('narrows to the products that come in any size picked, and the facets stay whole', async () => {
    const all = await searchCatalog(anon(), 'IN', parseQuery({}));

    const one = await searchCatalog(anon(), 'IN', parseQuery({ size: ONE }));
    expect(one.items.map((p) => p.id)).toEqual([a.id]);
    expect(one.items[0].sizes).toEqual([ONE, TWO]);
    expect(one.sizeFacets).toEqual(all.sizeFacets);

    const two = await searchCatalog(anon(), 'IN', parseQuery({ size: TWO }));
    expect(two.items.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());

    const either = await searchCatalog(anon(), 'IN', parseQuery({ size: `${ONE},${TWO}` }));
    expect(either.total).toBe(2);

    expect((await searchCatalog(anon(), 'IN', parseQuery({ size: 'SF 9' }))).total).toBe(0);
    // with the department too: that department's products in that size only
    const dept = await searchCatalog(anon(), 'IN', parseQuery({ size: TWO, dept: a.dept }));
    expect(dept.items.map((p) => p.id).sort()).toEqual([a, b].filter((p) => p.dept === a.dept).map((p) => p.id).sort());
  });

  it('leaves products with none left out of the facets', async () => {
    const { data, error } = await admin().from('products').select('stock').eq('id', a.id).single();
    if (error) throw error;
    const { error: e1 } = await admin().from('products').update({ stock: 0 }).eq('id', a.id);
    if (e1) throw e1;
    try {
      const inStock = await searchCatalog(anon(), 'IN', parseQuery({}));
      expect(facet(inStock.sizeFacets, ONE)).toBeUndefined();
      const withOut = await searchCatalog(anon(), 'IN', parseQuery({ oos: '1' }));
      expect(facet(withOut.sizeFacets, ONE)).toBe(1);
    } finally {
      await admin().from('products').update({ stock: data.stock }).eq('id', a.id);
    }
  });
});
