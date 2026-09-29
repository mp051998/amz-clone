import { describe, expect, it } from 'vitest';
import { product } from '@/test/fixtures/decision';
import { decisionConfig } from './attributes';
import { rankOne, rankProducts, strength, warn, why } from './rank';
import type { ProductInsight } from './types';

const cfg = decisionConfig('electronics');
const insight = (id: string, scores: Record<string, number>, cons: string[] = []): ProductInsight => ({
  productId: id,
  scores,
  pros: [],
  cons,
  bestFor: '',
  summary: '',
  praised: [],
  criticized: [],
  source: 'rules',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('rank', () => {
  const a = product({ id: 'a', title: 'Alpha Headphones 60h battery', priceMinor: 5000 });
  const b = product({ id: 'b', title: 'Beta Headphones', priceMinor: 20000 });
  const ins = new Map([
    ['a', insight('a', { sound: 3, battery: 5, comfort: 4, anc: 2, value: 4 })],
    ['b', insight('b', { sound: 5, battery: 3, comfort: 4, anc: 5, value: 2 })],
  ]);

  it('orders by match against the weights', () => {
    const battery = rankProducts([a, b], ins, { sound: 1, battery: 5, comfort: 1, anc: 0, value: 1 });
    expect(battery.map((r) => r.product.id)).toEqual(['a', 'b']);
    const sound = rankProducts([a, b], ins, { sound: 5, battery: 0, comfort: 1, anc: 5, value: 0 });
    expect(sound.map((r) => r.product.id)).toEqual(['b', 'a']);
    expect(sound[0].match).toBeGreaterThan(sound[1].match);
  });

  it('filters to the budget and supports price sorts', () => {
    expect(rankProducts([a, b], ins, cfg.defaultWeights, { budgetMinor: 10000 }).map((r) => r.product.id)).toEqual(['a']);
    expect(rankProducts([a, b], ins, cfg.defaultWeights, { sort: 'price-desc' })[0].product.id).toBe('b');
  });

  it('why lists ≤ 3 strengths, using title details when present', () => {
    const battery = cfg.attributes.find((x) => x.key === 'battery')!;
    expect(strength(a, battery, 5)).toMatch(/60h/i);
    const w = why(a, ins.get('a')!.scores, { sound: 0, battery: 5, comfort: 3, anc: 0, value: 1 }, cfg);
    expect(w.length).toBeLessThanOrEqual(3);
    expect(w[0]).toMatch(/60h/i);
  });

  it('warn flags a weak attribute the shopper cares about, else insight cons, else low stock', () => {
    const s = ins.get('a')!.scores;
    expect(warn(a, s, { anc: 5 }, null, cfg)).toBe(cfg.attributes.find((x) => x.key === 'anc')!.weak);
    expect(warn(a, s, { anc: 1 }, insight('a', s, ['Creaky hinge']), cfg)).toBe('Creaky hinge');
    expect(warn(product({ stock: 3 }), s, { anc: 1 }, null, cfg)).toBe('Only 3 left in stock');
  });

  it('rankOne falls back to derived scores without an insight', () => {
    const r = rankOne(a, null, cfg.defaultWeights);
    expect(r.match).toBeGreaterThan(0);
    expect(r.match).toBeLessThanOrEqual(100);
  });
});
