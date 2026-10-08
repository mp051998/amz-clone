import { describe, expect, it } from 'vitest';
import { product } from '@/test/fixtures/decision';
import { BRAND_SECTION, brandStoreOf } from './brands';

const many = (n: number, over: Parameters<typeof product>[0] = {}) =>
  Array.from({ length: n }, (_, i) => product({ id: `${over.category ?? 'p'}-${i}`, ...over }));

describe('brandStoreOf', () => {
  it('puts the most popular first and keeps each section short', () => {
    const products = many(BRAND_SECTION + 3);
    const shop = brandStoreOf('Acme', products);
    expect(shop.brand).toBe('Acme');
    expect(shop.count).toBe(BRAND_SECTION + 3);
    expect(shop.bestSellers.map((p) => p.id)).toEqual(products.slice(0, BRAND_SECTION).map((p) => p.id));
  });

  it('groups the brand by department, the biggest first, each with its count', () => {
    const shop = brandStoreOf('Acme', [
      product({ id: 'k1', category: 'home-kitchen', categoryName: 'Home & Kitchen' }),
      ...many(BRAND_SECTION + 2, { category: 'electronics', categoryName: 'Electronics' }),
      product({ id: 'k2', category: 'home-kitchen', categoryName: 'Home & Kitchen' }),
    ]);
    expect(shop.departments.map((d) => [d.slug, d.name, d.count, d.products.length])).toEqual([
      ['electronics', 'Electronics', BRAND_SECTION + 2, BRAND_SECTION],
      ['home-kitchen', 'Home & Kitchen', 2, 2],
    ]);
    // in popularity order within each
    expect(shop.departments[1].products.map((p) => p.id)).toEqual(['k1', 'k2']);
  });

  it('breaks a tie between departments by the brand’s most popular product', () => {
    const shop = brandStoreOf('Acme', [
      product({ id: 'a', category: 'toys', categoryName: 'Toys' }),
      product({ id: 'b', category: 'books', categoryName: 'Books' }),
    ]);
    expect(shop.departments.map((d) => d.slug)).toEqual(['toys', 'books']);
  });

  it('lists only its deals, the deepest first', () => {
    const shop = brandStoreOf('Acme', [
      product({ id: 'full' }),
      product({ id: 'small', deal: true, dealPct: 10 }),
      product({ id: 'flag-only', deal: true }),
      product({ id: 'big', deal: true, dealPct: 35 }),
    ]);
    expect(shop.deals.map((p) => p.id)).toEqual(['big', 'small']);
  });

  it('has no deals when nothing is on sale', () => {
    expect(brandStoreOf('Acme', [product()]).deals).toEqual([]);
  });
});
