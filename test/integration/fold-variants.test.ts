import { describe, expect, it } from 'vitest';
import { listCategories, listProducts, searchCatalog, variantSummaries } from '@/lib/data/catalog';
import { parseQuery } from '@/lib/decision/query';
import { rankedSearch } from '@/lib/decision/server';
import { parseQuery as parseFacets } from '@/lib/search';
import { anon } from './helpers';

// seeded groups (supabase/seed/variants.json)
const SONY = ['41lArSiD5hL', '41JACWTwWL'];
const HAWKINS = ['in-619CmDHn8L', 'in-51K1LMDAvkL', 'in-51LKIBnva1L'];

describe('folded variants', () => {
  it('listings show one card per group unless asked for every option', async () => {
    const folded = await listProducts(anon(), 'US', { category: 'electronics' });
    expect(folded.filter((p) => SONY.includes(p.id))).toHaveLength(1);
    const sony = folded.find((p) => SONY.includes(p.id))!;
    expect(sony.variant).toMatchObject({ group: 'sony-wh-ch520', axis: 'Color' });

    const all = await listProducts(anon(), 'US', { category: 'electronics', allVariants: true });
    expect(all.filter((p) => SONY.includes(p.id))).toHaveLength(2);
    expect(folded.length).toBeLessThan(all.length);
  });

  it('still fills a limit after folding', async () => {
    const all = await listProducts(anon(), 'US', { category: 'electronics', allVariants: true });
    const limited = await listProducts(anon(), 'US', { category: 'electronics', limit: all.length - 1 });
    expect(limited.length).toBe(all.length - 1 - 1); // every folded product, the Sony pair counted once
  });

  it('search counts groups once, facets included', async () => {
    const res = await searchCatalog(anon(), 'US', parseFacets({ k: 'sony' }));
    const sonyHits = res.items.filter((p) => SONY.includes(p.id));
    expect(sonyHits).toHaveLength(2); // the page itself stays per product
    expect(res.groups).toBe(res.total - 1);
    const brand = res.brandFacets.find((b) => b.name === 'Sony');
    expect(brand?.count).toBe(res.items.filter((p) => p.brand === 'Sony').length - 1);
  });

  it('summarises a group with its options in label order', async () => {
    const m = await variantSummaries(anon(), 'IN', ['hawkins-contura-black', 'nope']);
    expect([...m.keys()]).toEqual(['hawkins-contura-black']);
    const g = m.get('hawkins-contura-black')!;
    expect(g.axis).toBe('Size');
    expect(g.options.map((o) => o.label)).toEqual(['1.5 Litre', '3 Litre', '3 Litre XT (induction)']);
    expect(g.options.map((o) => o.id).sort()).toEqual([...HAWKINS].sort());
    expect(await variantSummaries(anon(), 'US', ['hawkins-contura-black'])).toEqual(new Map());
  });

  it('ranked search keeps the best-placed option of a group', async () => {
    const db = anon();
    const q = parseQuery('US', 'sony headphones', await listCategories(db, 'US'));
    const res = await rankedSearch('US', q, null, null, {}, db);
    expect(res.items.filter((r) => SONY.includes(r.product.id))).toHaveLength(1);
    expect(new Set(res.items.map((r) => r.product.id)).size).toBe(res.items.length);
  });
});
