import { describe, expect, it } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import { getProduct, getProducts, getRatingSummary, listCategories, listProducts, searchCatalog } from '@/lib/data/catalog';
import { getHomeContent } from '@/lib/home-content';
import { parseQuery } from '@/lib/search';
import { admin, anon } from './helpers';

describe('catalog', () => {
  it('each store has its own departments and products', async () => {
    const [us, india] = await Promise.all([listCategories(anon(), 'US'), listCategories(anon(), 'IN')]);
    expect(us.length).toBeGreaterThan(3);
    expect(india.map((c) => c.slug)).toContain('fashion');
    const products = await listProducts(anon(), 'IN', { limit: 20 });
    expect(products.length).toBe(20);
    expect(products.every((p) => p.market === 'IN' && p.curBase === 'INR')).toBe(true);
  });

  it('search filters, sorts and facets inside the database', async () => {
    const all = await searchCatalog(anon(), 'US', parseQuery({}));
    expect(all.total).toBeGreaterThan(all.items.length);
    expect(all.items).toHaveLength(16);

    const cheap = await searchCatalog(anon(), 'US', parseQuery({ sort: 'price-asc' }));
    const prices = cheap.items.map((p) => p.priceMinor);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    const dept = 'electronics';
    const inDept = await searchCatalog(anon(), 'US', parseQuery({ dept }));
    expect(inDept.items.every((p) => p.category === dept)).toBe(true);
    expect(inDept.headingLabel).not.toBe('All departments');

    const brand = inDept.brandFacets[0];
    const byBrand = await searchCatalog(anon(), 'US', parseQuery({ dept, brand: brand.name }));
    expect(byBrand.total).toBe(brand.count);

    const rated = await searchCatalog(anon(), 'US', parseQuery({ rating: '4' }));
    expect(rated.items.every((p) => p.rating >= 4)).toBe(true);
    const deals = await searchCatalog(anon(), 'US', parseQuery({ deal: '1' }));
    expect(deals.items.every((p) => p.deal)).toBe(true);
  });

  it('search keeps a price range; brand facets still cover the whole department', async () => {
    const dept = 'electronics';
    const inDept = await searchCatalog(anon(), 'US', parseQuery({ dept, sort: 'price-asc' }));
    const min = inDept.items[2].priceMinor;
    const max = inDept.items[8].priceMinor;
    const inRange = async (lo: number | null, hi: number | null) => {
      let q = admin().from('catalog_products').select('id', { count: 'exact', head: true }).eq('market_id', 'US').eq('category_slug', dept);
      if (lo != null) q = q.gte('price_minor', lo);
      if (hi != null) q = q.lte('price_minor', hi);
      return (await q).count;
    };

    const ranged = await searchCatalog(anon(), 'US', parseQuery({ dept, min: String(min), max: String(max), sort: 'price-asc' }));
    expect(ranged.items.length).toBeGreaterThanOrEqual(7);
    expect(ranged.items.every((p) => p.priceMinor >= min && p.priceMinor <= max)).toBe(true);
    expect(ranged.total).toBe(await inRange(min, max));
    expect(ranged.total).toBeLessThan(inDept.total);
    expect(ranged.brandFacets).toEqual(inDept.brandFacets);

    const from = await searchCatalog(anon(), 'US', parseQuery({ dept, min: String(max) }));
    expect(from.items.every((p) => p.priceMinor >= max)).toBe(true);
    expect(from.total).toBe(await inRange(max, null));
    const upTo = await searchCatalog(anon(), 'US', parseQuery({ dept, max: String(min) }));
    expect(upTo.items.every((p) => p.priceMinor <= min)).toBe(true);
    expect(upTo.total).toBe(await inRange(null, min));

    const backwards = await searchCatalog(anon(), 'US', parseQuery({ dept, min: String(max), max: String(min - 1) }));
    expect(backwards.total).toBe(0);
    expect(backwards.items).toEqual([]);
  });

  it('full-text search finds products by title words', async () => {
    const sample = (await listProducts(anon(), 'US', { limit: 1 }))[0];
    const word = sample.title.split(/\s+/).find((w) => /^[a-z]{5,}$/i.test(w))!;
    const res = await searchCatalog(anon(), 'US', parseQuery({ k: word }));
    expect(res.total).toBeGreaterThan(0);
    expect(res.headingLabel).toBe(`"${word}"`);
  });

  it('rating summary agrees with the product card', async () => {
    const p = (await listProducts(anon(), 'US', { order: 'popular', limit: 1 }))[0];
    const summary = await getRatingSummary(anon(), p.id);
    expect(summary.count).toBe(p.reviewCount);
    expect(summary.bars.reduce((n, b) => n + b.count, 0)).toBe(summary.count);
    expect(await getProduct(anon(), 'nope')).toBeNull();
  });
});

describe('home content', () => {
  it('selects the store campaign; Amazon Pay only in India', async () => {
    const [us, india] = await Promise.all([getHomeContent(anon(), amazon), getHomeContent(anon(), amazonIn)]);
    expect(us.campaign).toMatchObject({ id: 'us-deals', href: '/deals' });
    expect(india.campaign).toMatchObject({ id: 'in-festival', href: '/in/s?dept=electronics', image: '/campaigns/in-festival.svg' });
    expect(us.showPay).toBe(false);
    expect(india.showPay).toBe(true);
  });

  it.each([amazon, amazonIn])('$id cards link into their own catalog', async (store) => {
    const { cards } = await getHomeContent(anon(), store);
    const prefix = store.id === 'IN' ? '/in' : '';
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expect(card.href).toBe(`${prefix}/s?dept=${card.id}`);
      expect(card.items).toHaveLength(4);
      const ids = card.items.map((item) => item.href.split('/').pop()!);
      const products = await getProducts(anon(), ids);
      expect(products.every((p) => p.market === store.id && p.category === card.id)).toBe(true);
      card.items.forEach((item, i) => {
        expect(item.href).toBe(`${prefix}/product/${products[i].id}`);
        expect(item.alt).toBe(products[i].title);
      });
    }
  });

  it('rails lead with curated picks, top up with deals, never cross stores', async () => {
    const us = (await getHomeContent(anon(), amazon)).rails[0];
    const india = (await getHomeContent(anon(), amazonIn)).rails[0];
    expect(us.products.slice(0, 4).map((p) => p.id)).toEqual(['6181VJVcgSL', '51CnDMbXZzL', '61hzm0JOv3L', '71Hx8b6HGbL']);
    expect(india.products.slice(0, 4).map((p) => p.id)).toEqual(['in-61BWskzWNIL', 'in-711l4y8aNlL', 'in-71QdB7hDCAL', 'in-51lPcFkwYmL']);
    expect(india.products.length).toBeGreaterThan(4);
    expect(us.products.every((p) => p.market === 'US')).toBe(true);
    expect(india.products.every((p) => p.market === 'IN')).toBe(true);
  });

  it('honours configured order and drops ids from another store', async () => {
    const content = await getHomeContent(anon(), {
      ...amazonIn,
      ui: {
        home: [
          amazonIn.ui.home[0],
          { kind: 'merchandising-grid', id: 'custom-grid', cardIds: ['beauty', 'electronics'] },
          { kind: 'deal-rail', id: 'custom-rail', title: 'Custom picks', productIds: ['in-711l4y8aNlL', '6181VJVcgSL', 'missing', 'in-61BWskzWNIL'] },
        ],
      },
    });
    expect(content.cards.map((c) => c.id)).toEqual(['beauty', 'electronics']);
    expect(content.rails[0]).toMatchObject({ id: 'custom-rail', title: 'Custom picks' });
    expect(content.rails[0].products.slice(0, 2).map((p) => p.id)).toEqual(['in-711l4y8aNlL', 'in-61BWskzWNIL']);
    expect(content.rails[0].products.every((p) => p.market === 'IN')).toBe(true);
  });
});
