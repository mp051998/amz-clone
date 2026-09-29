import { describe, expect, it } from 'vitest';
import { product } from '@/test/fixtures/decision';
import { decisionConfig } from './attributes';
import { rankProducts } from './rank';
import { compareTable, compareVerdict, shortTitle } from './verdict';
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
