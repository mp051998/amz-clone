import { describe, expect, it } from 'vitest';
import { weightsFor } from './attributes';
import { decodeWeights, effectiveWeights, encodeWeights, readDecisionParams, writeDecisionParams } from './params';

describe('decision params', () => {
  it('round-trips weights', () => {
    const w = { sound: 5, battery: 4, comfort: 3, anc: 2, value: 1 };
    const enc = encodeWeights(w, 'electronics');
    expect(enc).toMatch(/battery\.4/);
    expect(decodeWeights(enc, 'electronics')).toEqual(w);
  });

  it('decode drops unknown keys and clamps', () => {
    const w = decodeWeights('battery.9,bogus.3', 'electronics')!;
    expect(w.battery).toBe(5);
    expect(w).not.toHaveProperty('bogus');
  });

  it('reads params with legacy sort aliases', () => {
    const p = readDecisionParams(new URLSearchParams('use=travel&sort=review&budget=5000'), 'electronics', 'US');
    expect(p.use).toBe('travel');
    expect(p.sort).toBe('rating');
    expect(p.budgetMinor).not.toBeNull();
    expect(effectiveWeights(p, 'electronics')).toEqual(weightsFor('electronics', 'travel'));
  });

  it('reads the newest-arrivals sort; anything unknown is best match', () => {
    expect(readDecisionParams(new URLSearchParams('sort=newest'), null, 'US').sort).toBe('newest');
    expect(readDecisionParams(new URLSearchParams('sort=oldest'), null, 'US').sort).toBe('match');
  });

  it('writes minimal params (omits implied weights and default sort, resets page)', () => {
    const usp = writeDecisionParams(
      { use: 'travel', weights: weightsFor('electronics', 'travel'), sort: 'match' },
      'electronics',
      new URLSearchParams('k=headphones&page=3'),
    );
    const s = new URLSearchParams(String(usp));
    expect(s.get('k')).toBe('headphones');
    expect(s.get('use')).toBe('travel');
    expect(s.has('w')).toBe(false);
    expect(s.has('sort')).toBe(false);
    expect(s.has('page')).toBe(false);
  });
});
