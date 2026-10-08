import { describe, expect, it } from 'vitest';
import { BRAND_SECTION, brandStore } from '@/lib/data/brands';
import { admin, anon } from './helpers';

describe('brand stores', () => {
  it("lays out everything of a brand's on sale in the store", async () => {
    const { data, error } = await admin()
      .from('catalog_products')
      .select('brand, category_slug')
      .eq('market_id', 'US')
      .not('brand', 'is', null)
      .order('review_count', { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    const p = { brand: data.brand!, category: data.category_slug };
    const shop = await brandStore(anon(), 'US', `  ${p.brand} `);
    expect(shop?.brand).toBe(p.brand);
    const all = [...shop!.bestSellers, ...shop!.deals, ...shop!.departments.flatMap((d) => d.products)];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((x) => x.brand === p.brand && x.market === 'US')).toBe(true);
    expect(shop!.bestSellers.length).toBeLessThanOrEqual(BRAND_SECTION);
    // most popular first
    const reviews = shop!.bestSellers.map((x) => x.reviewCount);
    expect(reviews).toEqual([...reviews].sort((a, b) => b - a));
    expect(shop!.departments.reduce((n, d) => n + d.count, 0)).toBe(shop!.count);
    expect(shop!.departments.map((d) => d.slug)).toContain(p.category);
    expect(shop!.deals.every((x) => x.deal && x.dealPct)).toBe(true);
  });

  it('is null for a brand with nothing here', async () => {
    expect(await brandStore(anon(), 'US', 'No Such Brand Anywhere')).toBeNull();
    expect(await brandStore(anon(), 'US', '   ')).toBeNull();
  });
});
