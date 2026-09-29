import { describe, expect, it } from 'vitest';
import { product } from '@/test/fixtures/decision';
import { decisionConfig } from './attributes';
import { rankProducts } from './rank';
import { categoryGroups, compareTable, compareVerdict, mixedCompareTable, shortTitle } from './verdict';
import type { ProductInsight } from './types';

const ins = (id: string, scores: Record<string, number>): ProductInsight => ({
  productId: id, scores, pros: [], cons: [], bestFor: 'Travel', summary: '', praised: [], criticized: [], source: 'rules', updatedAt: '',
});

describe('verdict', () => {
  const cfg = decisionConfig('electronics');
  const a = product({ id: 'a', title: 'Alpha One Wireless Headphones, Black', priceMinor: 5000, brand: 'Acme' });
  const b = product({ id: 'b', title: 'Beta Two Headphones', priceMinor: 9000, brand: 'Acme' });
  const insights = new Map([
    ['a', ins('a', { sound: 3, battery: 5, comfort: 4, anc: 2, value: 4 })],
    ['b', ins('b', { sound: 5, battery: 3, comfort: 4, anc: 5, value: 2 })],
  ]);
  const weights = { sound: 5, battery: 1, comfort: 1, anc: 5, value: 0 };
  const ranked = rankProducts([a, b], insights, weights, { config: cfg });

  it('shortTitle trims to the first clause', () => {
    expect(shortTitle('Alpha One Wireless Headphones, Black')).toBe('Alpha One Wireless Headphones');
  });

  it('picks the best match and explains it', () => {
    const v = compareVerdict(ranked, weights, cfg);
    expect(v.winnerId).toBe('b');
    expect(v.text).toMatch(/leading on/);
    expect(v.perProduct).toHaveLength(2);
    expect(v.perProduct[0].strengths.length).toBeGreaterThan(0);
  });

  it('splits differing rows from identical ones', () => {
    const t = compareTable(ranked, cfg);
    expect(t.rows.map((r) => r.label)).toContain('Price');
    expect(t.same).toContain('Brand: Acme');
    const price = t.rows.find((r) => r.label === 'Price')!;
    expect(price.cells.filter((c) => c.best)).toHaveLength(1);
  });

  it('handles an empty list', () => {
    expect(compareVerdict([], weights).winnerId).toBe('');
  });
});

describe('mixed-category compare', () => {
  const phone = product({ id: 'm1', category: 'mobiles', categoryName: 'Mobiles', priceMinor: 20000, brand: 'Acme' });
  const phone2 = product({ id: 'm2', category: 'mobiles', categoryName: 'Mobiles', priceMinor: 25000, brand: 'Acme' });
  const book = product({ id: 'b1', category: 'books', categoryName: 'Books', priceMinor: 1500, brand: 'Penguin', rating: 4.8 });

  it('groups products by category in first-seen order', () => {
    expect(categoryGroups([phone, book, phone2])).toEqual([
      { slug: 'mobiles', name: 'Mobiles', ids: ['m1', 'm2'] },
      { slug: 'books', name: 'Books', ids: ['b1'] },
    ]);
    expect(categoryGroups([phone, phone2])).toHaveLength(1);
  });

  it('keeps only shared facts and never marks a BEST', () => {
    const t = mixedCompareTable([phone, book]);
    const labels = t.rows.map((r) => r.label);
    expect(labels).toEqual(['Category', 'Price', 'Rating', 'Brand']);
    expect(t.rows[0].cells.map((c) => c.text)).toEqual(['Mobiles', 'Books']);
    expect(t.rows.flatMap((r) => r.cells).some((c) => c.best)).toBe(false);
    expect(labels).not.toContain('Match for you');
    expect(t.same).toContain('Sold by: Acme');
  });
});
