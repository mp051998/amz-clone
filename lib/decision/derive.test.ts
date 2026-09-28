import { describe, expect, it } from 'vitest';
import { product } from '@/test/fixtures/decision';
import { decisionConfig } from './attributes';
import { deriveInsight, deriveScores, matchScores, pricePercentiles } from './derive';

describe('matchScores', () => {
  it('is 100 when every weighted score is 5 and ignores zero weights', () => {
    expect(matchScores({ a: 5, b: 1 }, { a: 3, b: 0 })).toBe(100);
    expect(matchScores({ a: 1 }, { a: 5 })).toBe(20);
    // missing score counts as 3
    expect(matchScores({}, { a: 5 })).toBe(60);
  });
});

describe('deriveScores / deriveInsight', () => {
  const cfg = decisionConfig('electronics');

  it('is deterministic and within 1..5 for every attribute', () => {
    const a = deriveScores(product(), cfg, { pricePercentile: 0.5 });
    const b = deriveScores(product(), cfg, { pricePercentile: 0.5 });
    expect(a).toEqual(b);
    expect(Object.keys(a).sort()).toEqual(cfg.attributes.map((x) => x.key).sort());
    for (const v of Object.values(a)) expect(v >= 1 && v <= 5).toBe(true);
  });

  it('cheaper products score higher on value', () => {
    const cheap = deriveScores(product(), cfg, { pricePercentile: 0 });
    const dear = deriveScores(product(), cfg, { pricePercentile: 1 });
    expect(cheap.value).toBeGreaterThan(dear.value);
  });

  it('builds pros, cons, summary and themes', () => {
    const ins = deriveInsight(product({ reviewCount: 90 }), cfg, { pricePercentile: 0.5 });
    expect(ins.source).toBe('rules');
    expect(ins.pros.length).toBeGreaterThan(0);
    expect(ins.pros.length).toBeLessThanOrEqual(3);
    expect(ins.cons).toContain('Few reviews so far');
    expect(ins.summary).toMatch(/out of 5 across 90 ratings/);
    expect(ins.praised).toHaveLength(3);
    expect(ins.bestFor).toBeTruthy();
  });
});

describe('pricePercentiles', () => {
  it('ranks within market+category', () => {
    const m = pricePercentiles([
      { id: 'a', market: 'US', category: 'x', priceMinor: 100 },
      { id: 'b', market: 'US', category: 'x', priceMinor: 300 },
      { id: 'c', market: 'US', category: 'x', priceMinor: 200 },
      { id: 'd', market: 'IN', category: 'x', priceMinor: 5 },
    ]);
    expect(m.get('a')).toBe(0);
    expect(m.get('c')).toBe(0.5);
    expect(m.get('b')).toBe(1);
    expect(m.get('d')).toBe(0.5);
  });
});
