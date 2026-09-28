import { describe, expect, it } from 'vitest';
import { decisionConfig, PRICE_VS_QUALITY, quizFor } from './attributes';
import { ruleProfile } from './profile';

describe('ruleProfile', () => {
  const cfg = decisionConfig('electronics');
  const quiz = quizFor('electronics');

  it('defaults to the category weights with a reason per attribute', () => {
    const p = ruleProfile('electronics', {});
    expect(p.source).toBe('rules');
    expect(p.weights).toEqual(cfg.defaultWeights);
    for (const a of cfg.attributes) expect(p.reasons[a.key]).toBeTruthy();
    expect(p.summary).toMatch(/You care most about/);
  });

  it('pain and price answers move the weights, clamped to 0..5', () => {
    const battery = cfg.attributes.find((a) => a.key === 'battery')!;
    const p = ruleProfile('electronics', { pain: [battery.pain], priceVsQuality: PRICE_VS_QUALITY[0] });
    expect(p.weights.battery).toBeGreaterThan(cfg.defaultWeights.battery - 1);
    expect(p.weights.value).toBeGreaterThanOrEqual(cfg.defaultWeights.value);
    for (const v of Object.values(p.weights)) expect(v >= 0 && v <= 5).toBe(true);
  });

  it('use answers apply their boosts', () => {
    const p = ruleProfile('electronics', { use: [quiz[0].options[0]] });
    expect(p.weights).not.toEqual({});
    expect(Object.keys(p.weights).sort()).toEqual(cfg.attributes.map((a) => a.key).sort());
  });
});
