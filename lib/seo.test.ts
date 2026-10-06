import { describe, expect, it } from 'vitest';
import { jsonLdHtml, productDescription, productJsonLd, productUrl, robotsRules, sitemapEntries, STORE_PAGES, websiteJsonLd } from './seo';
import type { Product } from './types';

const ORIGIN = 'https://store.example';

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'B0KETTLE',
    market: 'US',
    title: 'Stainless Steel Electric Kettle 1.7L',
    brand: 'Cosori',
    category: 'home-kitchen',
    categoryName: 'Home & Kitchen',
    image: '/products/abc123.jpg',
    priceMinor: 3499,
    listMinor: 4999,
    rating: 4.6,
    reviewCount: 1200,
    seller: 'Store',
    shipsFrom: 'Store',
    bullets: ['Boils 1.7 litres in about 4 minutes.', 'Auto shut-off and boil-dry protection.', 'BPA-free.'],
    stock: 12,
    curBase: 'USD',
    ...over,
  };
}

describe('productUrl', () => {
  it('lives in its own store', () => {
    expect(productUrl(product())).toBe('/product/B0KETTLE');
    expect(productUrl(product({ id: 'IN 7/1', market: 'IN' }))).toBe('/in/product/IN%207%2F1');
  });
});

describe('productDescription', () => {
  it('reads the first bullets, cut at a word near 160 characters', () => {
    expect(productDescription(product())).toBe('Boils 1.7 litres in about 4 minutes. Auto shut-off and boil-dry protection. BPA-free.');
    const long = productDescription(product({ bullets: ['word '.repeat(60)] }));
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });

  it("ends each bullet as a sentence so they don't run together", () => {
    expect(productDescription(product({ bullets: ['Bluetooth 5.3, up to 33 ft', 'Built-in microphone!', 'USB-C'] }))).toBe('Bluetooth 5.3, up to 33 ft. Built-in microphone! USB-C.');
  });

  it('falls back to the brand, title and department', () => {
    expect(productDescription(product({ bullets: [] }))).toBe('Cosori Stainless Steel Electric Kettle 1.7L, in Home & Kitchen.');
    expect(productDescription(product({ bullets: [' '], brand: undefined }))).toBe('Stainless Steel Electric Kettle 1.7L, in Home & Kitchen.');
  });
});

describe('productJsonLd', () => {
  it('describes the product, its offer and its rating with absolute links', () => {
    expect(productJsonLd(product(), ORIGIN, { rating: 4.62, count: 1200 })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Stainless Steel Electric Kettle 1.7L',
      sku: 'B0KETTLE',
      image: ['https://store.example/products/zoom/abc123.jpg'],
      description: 'Boils 1.7 litres in about 4 minutes. Auto shut-off and boil-dry protection. BPA-free.',
      category: 'Home & Kitchen',
      brand: { '@type': 'Brand', name: 'Cosori' },
      url: 'https://store.example/product/B0KETTLE',
      offers: {
        '@type': 'Offer',
        url: 'https://store.example/product/B0KETTLE',
        price: '34.99',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: 'Store' },
      },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.6', reviewCount: 1200, bestRating: '5', worstRating: '1' },
    });
  });

  it('India: rupee price from paise, out of stock, no brand or rating', () => {
    const ld = productJsonLd(product({ market: 'IN', curBase: 'INR', priceMinor: 199900, stock: 0, brand: undefined, image: 'https://cdn.example/x.png' }), ORIGIN, { rating: 0, count: 0 });
    expect(ld.url).toBe('https://store.example/in/product/B0KETTLE');
    expect(ld.image).toEqual(['https://cdn.example/x.png']);
    expect(ld.offers).toMatchObject({ price: '1999.00', priceCurrency: 'INR', availability: 'https://schema.org/OutOfStock' });
    expect(ld).not.toHaveProperty('brand');
    expect(ld).not.toHaveProperty('aggregateRating');
  });
});

describe('jsonLdHtml', () => {
  it("can't close the script tag it sits in", () => {
    const html = jsonLdHtml({ name: '</script><script>alert(1)</script>' });
    expect(html).not.toContain('<');
    expect(JSON.parse(html)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});

describe('robotsRules', () => {
  it('keeps crawlers out of private and per-shopper pages in both stores and points at the sitemap', () => {
    const r = robotsRules(ORIGIN);
    expect(r.sitemap).toBe('https://store.example/sitemap.xml');
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.userAgent).toBe('*');
    expect(rule.allow).toBe('/');
    for (const p of ['/admin', '/account', '/cart', '/checkout', '/orders', '/api/', '/in/admin', '/in/cart', '/in/orders']) expect(rule.disallow).toContain(p);
    expect(rule.disallow).not.toContain('/s');
  });
});

describe('sitemapEntries', () => {
  const entries = sitemapEntries(ORIGIN, {
    US: { categories: [{ slug: 'electronics', name: 'Electronics' }], products: [product()] },
    IN: { categories: [{ slug: 'kitchen', name: 'Kitchen' }], products: [product({ id: 'IN1', market: 'IN', image: '/products/in/def.jpg' })] },
  });
  const byUrl = new Map(entries.map((e) => [e.url, e]));

  it('lists each store page in both stores, linked to each other', () => {
    for (const path of STORE_PAGES) {
      const us = `${ORIGIN}${path === '/' ? '' : path}`;
      const ind = `${ORIGIN}/in${path === '/' ? '' : path}`;
      expect(byUrl.has(us), us).toBe(true);
      expect(byUrl.has(ind), ind).toBe(true);
      expect(byUrl.get(us)!.alternates?.languages).toEqual({ 'en-US': us, 'en-IN': ind, 'x-default': us });
    }
    expect(byUrl.get(ORIGIN)!.priority).toBe(1);
  });

  it('lists each department and product in its own store, with the product photo', () => {
    expect(byUrl.has(`${ORIGIN}/s?dept=electronics`)).toBe(true);
    expect(byUrl.has(`${ORIGIN}/in/s?dept=kitchen`)).toBe(true);
    expect(byUrl.has(`${ORIGIN}/in/s?dept=electronics`)).toBe(false);
    expect(byUrl.get(`${ORIGIN}/product/B0KETTLE`)!.images).toEqual([`${ORIGIN}/products/zoom/abc123.jpg`]);
    expect(byUrl.get(`${ORIGIN}/in/product/IN1`)!.images).toEqual([`${ORIGIN}/products/in/zoom/def.jpg`]);
    expect(entries.filter((e) => e.url.includes('/product/'))).toHaveLength(2);
  });
});

describe('websiteJsonLd', () => {
  it('names the store and how to search it', () => {
    expect(websiteJsonLd(ORIGIN, 'US', 'Store')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Store',
      url: 'https://store.example/',
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: 'https://store.example/s?k={search_term_string}' },
        'query-input': 'required name=search_term_string',
      },
    });
    const ind = websiteJsonLd(ORIGIN, 'IN', 'Store');
    expect(ind.url).toBe('https://store.example/in');
    expect(ind.potentialAction.target.urlTemplate).toBe('https://store.example/in/s?k={search_term_string}');
  });
});
