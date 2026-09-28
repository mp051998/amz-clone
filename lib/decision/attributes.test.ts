import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/test/fixtures/decision';
import {
  CONFIGURED_CATEGORIES,
  GENERIC_CONFIG,
  budgetRange,
  clampBudget,
  clampWeights,
  decisionConfig,
  quizFor,
  weightsFor,
} from './attributes';

describe('decision configs', () => {
  it('covers every seeded category with 5 attributes and 3–6 presets including value', () => {
    for (const c of CATEGORIES) {
      expect(CONFIGURED_CATEGORIES).toContain(c.slug);
      const cfg = decisionConfig(c.slug);
      expect(cfg.category).toBe(c.slug);
      expect(cfg.attributes).toHaveLength(5);
      expect(cfg.presets.length).toBeGreaterThanOrEqual(3);
      expect(cfg.presets.length).toBeLessThanOrEqual(6);
      expect(cfg.presets.map((p) => p.id)).toContain('value');
      const keys = cfg.attributes.map((a) => a.key).sort();
      expect(Object.keys(cfg.defaultWeights).sort()).toEqual(keys);
      for (const p of cfg.presets) expect(Object.keys(p.weights).sort()).toEqual(keys);
    }
  });

  it('falls back to the generic config', () => {
    expect(decisionConfig('garden')).toBe(GENERIC_CONFIG);
    expect(decisionConfig(null).attributes).toHaveLength(5);
  });

  it('weightsFor returns preset or default weights (copies)', () => {
    const w = weightsFor('electronics', 'travel');
    expect(w).toEqual(decisionConfig('electronics').presets.find((p) => p.id === 'travel')!.weights);
    w.sound = 99;
    expect(weightsFor('electronics', 'travel').sound).not.toBe(99);
    expect(weightsFor('electronics', 'nope')).toEqual(decisionConfig('electronics').defaultWeights);
  });

  it('clampWeights keeps only category keys, rounds and clamps 0..5', () => {
    const w = clampWeights('electronics', { sound: 9, battery: -2, comfort: '3.6', bogus: 5 });
    expect(w.sound).toBe(5);
    expect(w.battery).toBe(0);
    expect(w.comfort).toBe(4);
    expect(w).not.toHaveProperty('bogus');
    expect(Object.keys(w).sort()).toEqual(decisionConfig('electronics').attributes.map((a) => a.key).sort());
  });

  it('quizFor has 5 steps; pain options are the attribute pains', () => {
    const q = quizFor('electronics');
    expect(q.map((s) => s.id)).toEqual(['use', 'duration', 'priceVsQuality', 'pain', 'note']);
    expect(q[0].multi).toBe(true);
    expect(q[3].options).toEqual(decisionConfig('electronics').attributes.map((a) => a.pain));
    expect(q[4].options).toEqual([]);
  });

  it('budget helpers are market-aware and snap to the step', () => {
    const us = budgetRange('US', 'electronics');
    const inr = budgetRange('IN', 'electronics');
    expect(us.currency).toBe('USD');
    expect(inr.currency).toBe('INR');
    expect(inr.maxMinor).toBeGreaterThan(us.maxMinor);
    expect(clampBudget('US', 'electronics', 1)).toBe(us.minMinor);
    expect(clampBudget('US', 'electronics', 10_000_000)).toBe(us.maxMinor);
    const snapped = clampBudget('IN', 'electronics', 312_345)!;
    expect(snapped % inr.stepMinor).toBe(0);
    expect(clampBudget('US', 'electronics', null)).toBeNull();
  });
});
