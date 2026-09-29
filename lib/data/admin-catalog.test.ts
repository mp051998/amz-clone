import { describe, expect, it } from 'vitest';
import { dealPct, newProductId, productStatus, toMinor, validateProduct, type ProductInput } from './admin-catalog';

const good: ProductInput = {
  title: 'Acme Wireless Headphones',
  brand: 'Acme',
  category: 'electronics',
  image: '/products/acme.jpg',
  priceMinor: 4999,
  listMinor: 6999,
  deal: true,
  badge: null,
  boughtPastMonth: null,
  seller: 'Acme Store',
  shipsFrom: 'Store',
  bullets: ['40h battery'],
  stock: 12,
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
