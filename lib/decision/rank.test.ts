import { describe, expect, it } from 'vitest';
import { product } from '@/test/fixtures/decision';
import { decisionConfig } from './attributes';
import { rankOne, rankProducts, strength, warn, why } from './rank';
import { foldVariants } from '../variants';
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

  it('puts products in stock first, whatever the sort', () => {
    const gone = product({ id: 'gone', title: 'Gamma Headphones 60h battery', priceMinor: 1000, rating: 4.9, stock: 0 });
    const all = new Map([...ins, ['gone', insight('gone', { sound: 5, battery: 5, comfort: 5, anc: 5, value: 5 })]]);
    for (const sort of ['match', 'price-asc', 'price-desc', 'rating', 'newest', 'bestsellers'] as const) {
      const ids = rankProducts([gone, a, b], all, cfg.defaultWeights, { sort }).map((r) => r.product.id);
      expect(ids.at(-1)).toBe('gone');
    }
    // among themselves, the sort still applies
    const ids = rankProducts([gone, a, b], all, cfg.defaultWeights, { sort: 'price-desc' }).map((r) => r.product.id);
    expect(ids).toEqual(['b', 'a', 'gone']);
  });

  it('so folding variants keeps the best option that is in stock', () => {
    const v = (id: string, label: string, stock: number) => product({ id, priceMinor: 5000, stock, variant: { group: 'g1', axis: 'Color', label } });
    const black = v('black', 'Black', 0);
    const white = v('white', 'White', 9);
    const scores = { sound: 4, battery: 4, comfort: 4, anc: 4, value: 4 };
    const all = new Map([
      ['black', insight('black', { ...scores, sound: 5 })],
      ['white', insight('white', scores)],
    ]);
    expect(foldVariants(rankProducts([black, white], all, cfg.defaultWeights), (r) => r.product).map((r) => r.product.id)).toEqual(['white']);
  });

  it('newest keeps the order the products came in', () => {
    const c = product({ id: 'c', title: 'Gamma Headphones', priceMinor: 9000 });
    expect(rankProducts([b, c, a], ins, cfg.defaultWeights, { sort: 'newest' }).map((r) => r.product.id)).toEqual(['b', 'c', 'a']);
  });

  it('best sellers are the most reviewed, then the best rated, then in the order they came', () => {
    const many = product({ id: 'many', reviewCount: 900, rating: 3.9 });
    const top = product({ id: 'top', reviewCount: 400, rating: 4.8 });
    const tieA = product({ id: 'tieA', reviewCount: 400, rating: 4.1 });
    const tieB = product({ id: 'tieB', reviewCount: 400, rating: 4.1 });
    const ranked = rankProducts([tieB, tieA, top, many], ins, cfg.defaultWeights, { sort: 'bestsellers' });
    expect(ranked.map((r) => r.product.id)).toEqual(['many', 'top', 'tieB', 'tieA']);
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
