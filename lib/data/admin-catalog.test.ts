import { describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { countAdminStock, dealPct, listAdminProducts, LOW_STOCK, newProductId, productStatus, stockFilter, toMinor, validateProduct, type ProductInput } from './admin-catalog';

const good: ProductInput = {
  title: 'Acme Wireless Headphones',
  brand: 'Acme',
  category: 'electronics',
  image: '/products/acme.jpg',
  priceMinor: 4999,
  listMinor: 6999,
  deal: true,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  badge: null,
  boughtPastMonth: null,
  seller: 'Acme Store',
  shipsFrom: 'Store',
  bullets: ['40h battery'],
  description: null,
  details: [],
  stock: 12,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
};

describe('validateProduct', () => {
  it('accepts a complete product and blanks optional text to null', () => {
    const res = validateProduct({ ...good, brand: '  ', badge: '' });
    expect(res).toEqual({ ok: true, data: { ...good, brand: null, badge: null } });
  });

  it('reports every bad field at once', () => {
    const res = validateProduct({ ...good, title: ' ', priceMinor: 0, stock: -1, seller: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(Object.keys(res.errors).sort()).toEqual(['priceMinor', 'seller', 'stock', 'title']);
    expect(res.errors.title).toBe('Enter a title');
  });

  it('needs a list price above the price, and one for a deal', () => {
    const low = validateProduct({ ...good, listMinor: 4999 });
    expect(!low.ok && low.errors.listMinor).toBe('The list price must be higher than the price');
    const deal = validateProduct({ ...good, listMinor: null, deal: true });
    expect(!deal.ok && deal.errors.deal).toBe('Add a list price to show it as a deal');
  });

  it('takes a whole-percent coupon from 5 to 50, and none by default', () => {
    expect(validateProduct({ ...good, couponPct: 15 })).toMatchObject({ ok: true, data: { couponPct: 15 } });
    for (const bad of [4, 51, 12.5]) {
      const res = validateProduct({ ...good, couponPct: bad });
      expect(!res.ok && res.errors.couponPct).toBeTruthy();
    }
    const { couponPct: _, ...noCoupon } = good;
    expect(validateProduct(noCoupon)).toMatchObject({ ok: true, data: { couponPct: null } });
  });

  it('takes a whole-number limit per customer from 1 to 99, and none by default', () => {
    expect(validateProduct({ ...good, maxPerCustomer: 3 })).toMatchObject({ ok: true, data: { maxPerCustomer: 3 } });
    for (const bad of [0, 100, 2.5]) {
      const res = validateProduct({ ...good, maxPerCustomer: bad });
      expect(!res.ok && res.errors.maxPerCustomer).toBeTruthy();
    }
    const { maxPerCustomer: _, ...noLimit } = good;
    expect(validateProduct(noLimit)).toMatchObject({ ok: true, data: { maxPerCustomer: null } });
  });

  it('takes 1 to 20 different sizes of up to 12 characters, and none by default', () => {
    expect(validateProduct({ ...good, sizes: [' S', 'M ', 'UK 10'] })).toMatchObject({ ok: true, data: { sizes: ['S', 'M', 'UK 10'] } });
    for (const bad of [[], ['S', 'S'], [''], ['x'.repeat(13)], Array.from({ length: 21 }, (_, i) => String(i))]) {
      const res = validateProduct({ ...good, sizes: bad });
      expect(!res.ok && res.errors.sizes).toBeTruthy();
    }
    const { sizes: _, ...noSizes } = good;
    expect(validateProduct(noSizes)).toMatchObject({ ok: true, data: { sizes: null } });
  });

  it('takes how much it holds in a known unit, rounded to 2 decimals, and none by default', () => {
    expect(validateProduct({ ...good, unit: { qty: 1.856, kind: 'oz' } })).toMatchObject({ ok: true, data: { unit: { qty: 1.86, kind: 'oz' } } });
    expect(validateProduct({ ...good, unit: { qty: 150, kind: 'ml' } })).toMatchObject({ ok: true, data: { unit: { qty: 150, kind: 'ml' } } });
    for (const bad of [{ qty: 0, kind: 'ml' }, { qty: 0.001, kind: 'ml' }, { qty: -3, kind: 'oz' }, { qty: 100_001, kind: 'g' }, { qty: 3, kind: 'cup' }, { qty: 3 }]) {
      const res = validateProduct({ ...good, unit: bad });
      expect(!res.ok && res.errors.unit).toBeTruthy();
    }
    const { unit: _, ...noUnit } = good;
    expect(validateProduct(noUnit)).toMatchObject({ ok: true, data: { unit: null } });
  });

  it('takes site paths and https URLs only', () => {
    expect(validateProduct({ ...good, image: 'https://cdn.example.com/a.jpg' }).ok).toBe(true);
    for (const image of ['http://x.com/a.jpg', 'javascript:alert(1)', '/etc/passwd', '']) {
      expect(validateProduct({ ...good, image }).ok).toBe(false);
    }
  });

  it('caps bullets at 10', () => {
    const res = validateProduct({ ...good, bullets: Array.from({ length: 11 }, (_, i) => `point ${i}`) });
    expect(!res.ok && res.errors.bullets).toBe('Up to 10 points');
  });
});

describe('validateProduct: description and details', () => {
  it('defaults both when an API client leaves them out', () => {
    const { description: _d, details: _t, ...legacy } = good;
    expect(validateProduct(legacy)).toEqual({ ok: true, data: { ...good, description: null, details: [] } });
  });

  it('trims rows and blanks an empty description to null', () => {
    const res = validateProduct({ ...good, description: '   ', details: [[' Brand ', ' Acme ']] });
    expect(res).toEqual({ ok: true, data: { ...good, description: null, details: [['Brand', 'Acme']] } });
  });

  it('caps the table and its cells', () => {
    const many = Array.from({ length: 21 }, (_, i) => [`Row ${i}`, 'x']);
    expect(validateProduct({ ...good, details: many })).toMatchObject({ ok: false, errors: { details: 'Up to 20 rows' } });
    expect(validateProduct({ ...good, details: [['L'.repeat(41), 'x']] })).toMatchObject({ ok: false, errors: { details: 'Keep labels under 40 characters' } });
    expect(validateProduct({ ...good, details: [['Brand', '']] })).toMatchObject({ ok: false, errors: { details: 'Every row needs a value' } });
    expect(validateProduct({ ...good, description: 'd'.repeat(2001) })).toMatchObject({ ok: false, errors: { description: 'Keep it under 2000 characters' } });
  });
});

describe('money and ids', () => {
  it('parses typed prices into minor units', () => {
    expect(toMinor('19.99')).toBe(1999);
    expect(toMinor('1,299')).toBe(129900);
    expect(toMinor('₹ 499.5')).toBe(49950);
    expect(toMinor('')).toBeNull();
    expect(toMinor('12.345')).toBeNull();
    expect(toMinor('-3')).toBeNull();
  });

  it('derives the discount from the list price', () => {
    expect(dealPct(4999, 6999)).toBe(29);
    expect(dealPct(9999, 10000)).toBe(1);
    expect(dealPct(4999, null)).toBeNull();
  });

  it('makes store-shaped ids', () => {
    expect(newProductId('US')).toMatch(/^n[A-Za-z0-9]{10}$/);
    expect(newProductId('IN')).toMatch(/^in-n[A-Za-z0-9]{10}$/);
    expect(newProductId('US')).not.toBe(newProductId('US'));
  });
});

describe('productStatus', () => {
  it('only "archived" selects the archived tab', () => {
    expect(productStatus('archived')).toBe('archived');
    expect(productStatus('active')).toBe('active');
    expect(productStatus(null)).toBe('active');
    expect(productStatus('deleted')).toBe('active');
  });
});

describe('validateProduct: gallery and variants', () => {
  it('keeps gallery order, dropping repeats and the main image', () => {
    const res = validateProduct({ ...good, gallery: ['https://img.test/a.jpg', '/products/acme.jpg', 'https://img.test/b.jpg', 'https://img.test/a.jpg'] });
    expect(res.ok && res.data.gallery).toEqual(['https://img.test/a.jpg', 'https://img.test/b.jpg']);
  });

  it('caps the gallery and wants image URLs', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `https://img.test/${i}.jpg`);
    const many = validateProduct({ ...good, gallery: nine });
    expect(!many.ok && many.errors.gallery).toBe('Up to 8 more images');
    const bad = validateProduct({ ...good, gallery: ['ftp://nope'] });
    expect(!bad.ok && bad.errors.gallery).toBe('Gallery images need an https:// URL');
    expect(validateProduct({ ...good, gallery: undefined }).ok).toBe(true);
  });

  it('normalises the group and needs an option in one', () => {
    const res = validateProduct({ ...good, variantGroup: ' Acme-Buds ', variantAxis: '', variantLabel: 'Black' });
    expect(res.ok && [res.data.variantGroup, res.data.variantAxis, res.data.variantLabel]).toEqual(['acme-buds', 'Style', 'Black']);
    const missing = validateProduct({ ...good, variantGroup: 'acme-buds', variantAxis: 'Color', variantLabel: ' ' });
    expect(!missing.ok && missing.errors.variantLabel).toBe('Name this product’s option, e.g. Black');
    const slug = validateProduct({ ...good, variantGroup: 'acme buds!', variantLabel: 'Black' });
    expect(!slug.ok && slug.errors.variantGroup).toMatch(/lowercase letters/);
  });

  it('ignores option fields without a group', () => {
    const res = validateProduct({ ...good, variantGroup: '', variantAxis: 'Color', variantLabel: 'Black' });
    expect(res.ok && [res.data.variantGroup, res.data.variantAxis, res.data.variantLabel]).toEqual([null, null, null]);
  });
});

/** A products query that records its filters and resolves to `reply`. */
function fakeDb(reply: (ops: unknown[][]) => { data?: unknown[]; count: number | null; error?: unknown }) {
  const queries: unknown[][][] = [];
  const db = {
    from() {
      const ops: unknown[][] = [];
      queries.push(ops);
      const q: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null, ...reply(ops) }).then(ok, bad),
      };
      for (const m of ['select', 'eq', 'is', 'not', 'lte', 'gte', 'or', 'order', 'range']) {
        q[m] = (...args: unknown[]) => {
          ops.push([m, ...args]);
          return q;
        };
      }
      return q;
    },
  };
  return { db: db as unknown as Db, queries };
}

const stockOps = (ops: unknown[][]) => ops.filter(([m]) => m === 'lte' || m === 'gte');

describe('stockFilter', () => {
  it('takes out and low only', () => {
    expect(stockFilter('out')).toBe('out');
    expect(stockFilter('low')).toBe('low');
    for (const v of [undefined, null, '', 'OUT', 'all', 3]) expect(stockFilter(v)).toBeUndefined();
  });
});

describe('listAdminProducts: stock', () => {
  it('filters to none left, or 1 to LOW_STOCK left, and not otherwise', async () => {
    const { db, queries } = fakeDb(() => ({ count: 0 }));
    await listAdminProducts(db, 'US', { stock: 'out' });
    await listAdminProducts(db, 'US', { stock: 'low' });
    await listAdminProducts(db, 'US', {});
    expect(queries.map(stockOps)).toEqual([[['lte', 'stock', 0]], [['gte', 'stock', 1], ['lte', 'stock', LOW_STOCK]], []]);
  });
});

describe('countAdminStock', () => {
  it('counts active products with none left and with few left in the market', async () => {
    const { db, queries } = fakeDb((ops) => ({ count: ops.some(([m, , v]) => m === 'lte' && v === 0) ? 3 : 9 }));
    expect(await countAdminStock(db, 'IN')).toEqual({ out: 3, low: 9 });
    expect(queries).toHaveLength(2);
    for (const ops of queries) {
      expect(ops).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
      expect(ops).toContainEqual(['eq', 'market_id', 'IN']);
      expect(ops).toContainEqual(['is', 'archived_at', null]);
    }
    expect(queries.map(stockOps)).toEqual([[['lte', 'stock', 0]], [['gte', 'stock', 1], ['lte', 'stock', LOW_STOCK]]]);
  });

  it('reads a missing count as 0 and throws on an error', async () => {
    expect(await countAdminStock(fakeDb(() => ({ count: null })).db, 'US')).toEqual({ out: 0, low: 0 });
    await expect(countAdminStock(fakeDb(() => ({ count: null, error: { code: '42501', message: 'denied' } })).db, 'US')).rejects.toThrow();
  });
});
