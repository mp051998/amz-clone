import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/test/fixtures/decision';
import { detectCategory, parseBudget, parseQuery } from './query';

describe('parseBudget', () => {
  it.each([
    ['headphones under ₹10,000', 1_000_000],
    ['laptop below 50k', 5_000_000],
    ['phone under 1.5 lakh', 15_000_000],
    ['shoes under $80', 8000],
    ['kettle less than 40 dollars', 4000],
  ])('%s', (q, minor) => {
    expect(parseBudget(q)?.minor).toBe(minor);
  });

  it('ignores specs that are not money', () => {
    expect(parseBudget('headphones with 40 hours battery')).toBeNull();
    expect(parseBudget('laptop 16 gb ram')).toBeNull();
  });
});

describe('parseQuery', () => {
  it('extracts category, budget, use and keywords with chips', () => {
    const p = parseQuery('IN', 'headphones for travel under ₹10,000', CATEGORIES);
    expect(p.category).toBe('electronics');
    expect(p.budgetMinor).toBe(1_000_000);
    expect(p.use).toBe('travel');
    expect(p.keywords).toMatch(/headphones/);
    expect(p.keywords).not.toMatch(/travel|under|10000/);
    expect(p.source).toBe('rules');
    const kinds = p.intents.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['category', 'budget', 'use']));
    expect(p.intents.find((i) => i.kind === 'budget')!.param).toBe('budget');
    expect(p.title).toMatch(/for travel/i);
    expect(p.title).toMatch(/under ₹10,000/);
  });

  it('only detects categories the store has', () => {
    expect(detectCategory('headphones', CATEGORIES.filter((c) => c.slug !== 'electronics'))).toBeNull();
  });

  it('handles plain keywords', () => {
    const p = parseQuery('US', 'kindle', CATEGORIES);
    expect(p.keywords).toBe('kindle');
    expect(p.budgetMinor).toBeNull();
  });
});
