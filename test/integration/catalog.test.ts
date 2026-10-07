import { describe, expect, it } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import { getProduct, getProducts, getRatingSummary, listCategories, listProducts, searchCatalog } from '@/lib/data/catalog';
import { getHomeContent } from '@/lib/home-content';
import { parseQuery } from '@/lib/search';
import { admin, anon, setStock } from './helpers';

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

    // Best Sellers: most reviewed, then best rated, the Bestsellers page's order
    const selling = await searchCatalog(anon(), 'US', parseQuery({ sort: 'bestsellers' }));
    expect(selling.query.sort).toBe('bestsellers');
    const ranks = selling.items.map((p) => [p.reviewCount, p.rating]);
    expect(ranks).toEqual([...ranks].sort((a, b) => b[0] - a[0] || b[1] - a[1]));

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
      // search leaves out what's out of stock
      let q = admin().from('catalog_products').select('id', { count: 'exact', head: true }).eq('market_id', 'US').eq('category_slug', dept).gt('stock', 0);
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

  it('search narrows to the sellers picked, with seller facets over the whole scope', async () => {
    const all = await searchCatalog(anon(), 'US', parseQuery({}));
    expect(all.sellerFacets.length).toBeGreaterThan(1);
    const [first, second] = all.sellerFacets;
    expect(first.count).toBeGreaterThanOrEqual(second.count);

    const one = await searchCatalog(anon(), 'US', parseQuery({ seller: first.name }));
    expect(one.items.length).toBeGreaterThan(0);
    expect(one.items.every((p) => p.seller === first.name)).toBe(true);
    // facets count each variant group once, as the storefront's cards do
    expect(one.groups).toBe(first.count);
    // the facets don't narrow by the seller picked, so the others can still be added
    expect(one.sellerFacets).toEqual(all.sellerFacets);

    const two = await searchCatalog(anon(), 'US', parseQuery({ seller: `${first.name}|${second.name}` }));
    const other = await searchCatalog(anon(), 'US', parseQuery({ seller: second.name }));
    expect(two.total).toBe(one.total + other.total);
    expect(two.items.every((p) => p.seller === first.name || p.seller === second.name)).toBe(true);

    const nobody = await searchCatalog(anon(), 'US', parseQuery({ seller: 'No Such Seller' }));
    expect(nobody.total).toBe(0);
    // a seller from the other store matches nothing here
    const india = await searchCatalog(anon(), 'IN', parseQuery({}));
    const onlyIndia = india.sellerFacets.find((s) => !all.sellerFacets.some((u) => u.name === s.name));
    if (onlyIndia) expect((await searchCatalog(anon(), 'US', parseQuery({ seller: onlyIndia.name }))).total).toBe(0);
  });

  it('search keeps products on sale for at least the discount picked', async () => {
    // the database's own count of in-stock products on sale for at least `pct` off
    const onSale = async (pct: number) => {
      const { count, error } = await admin()
        .from('catalog_products')
        .select('id', { count: 'exact', head: true })
        .eq('market_id', 'US')
        .eq('deal', true)
        .gte('deal_pct', pct)
        .gt('stock', 0);
      if (error) throw error;
      return count ?? 0;
    };
    const deals = await searchCatalog(anon(), 'US', parseQuery({ deal: '1', sort: 'price-asc' }));
    const pcts = deals.items.map((p) => p.dealPct ?? 0).filter((n) => n > 0);
    expect(pcts.length).toBeGreaterThan(0);
    const pct = Math.max(...pcts);

    const off = await searchCatalog(anon(), 'US', parseQuery({ pct: String(pct) }));
    expect(off.total).toBeGreaterThan(0);
    expect(off.total).toBe(await onSale(pct));
    expect(off.items.every((p) => p.deal && (p.dealPct ?? 0) >= pct)).toBe(true);
    expect(off.query.minDiscount).toBe(pct);

    const most = Math.max(pct, ...off.items.map((p) => p.dealPct ?? 0));
    const none = await searchCatalog(anon(), 'US', parseQuery({ pct: String(most + 1) }));
    expect(none.total).toBe(await onSale(most + 1));
    expect(none.items.every((p) => (p.dealPct ?? 0) > most)).toBe(true);
  });

  it('search leaves out products with none left unless asked, and says how many', async () => {
    // a product without options, so it alone is the match
    const { data, error } = await admin()
      .from('catalog_products')
      .select('id, title, stock, brand')
      .eq('market_id', 'US')
      .is('variant_group', null)
      .gte('stock', 25)
      .order('id', { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    const k = data.title!;
    const before = await searchCatalog(anon(), 'US', parseQuery({ k }));
    expect(before.items.map((p) => p.id)).toContain(data.id);

    await setStock(data.id!, 0);
    try {
      const hidden = await searchCatalog(anon(), 'US', parseQuery({ k }));
      expect(hidden.items.map((p) => p.id)).not.toContain(data.id);
      expect(hidden.total).toBe(before.total - 1);
      expect(hidden.unavailable).toBe(before.unavailable + 1);

      const shown = await searchCatalog(anon(), 'US', parseQuery({ k, oos: '1' }));
      expect(shown.items.map((p) => p.id)).toContain(data.id);
      expect(shown.total).toBe(before.total);
      expect(shown.unavailable).toBe(before.unavailable + 1);

      // a bare call still searches everything
      const bare = await anon().rpc('search_catalog', { p_market: 'US', p_q: k });
      expect(JSON.stringify(bare.data)).toContain(data.id);
    } finally {
      await setStock(data.id!, data.stock!);
    }
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
