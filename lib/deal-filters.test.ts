import { expect, it } from 'vitest';
import { atLeast, discountOptions, readDiscount } from './deal-filters';

it('reads only the offered steps', () => {
  expect(readDiscount('30')).toBe(30);
  expect(readDiscount(['50', '10'])).toBe(50);
  expect(readDiscount('35')).toBeNull();
  expect(readDiscount('abc')).toBeNull();
  expect(readDiscount(undefined)).toBeNull();
});

it('keeps deals at or above the step', () => {
  const deals = [{ id: 'a', dealPct: 45 }, { id: 'b', dealPct: 30 }, { id: 'c', dealPct: 12 }, { id: 'd', dealPct: null }];
  expect(atLeast(deals, 30).map((d) => d.id)).toEqual(['a', 'b']);
  expect(atLeast(deals, null)).toBe(deals);
});

it('offers the steps that narrow without emptying, plus the picked one', () => {
  const pcts = [45, 44, 31, 22, 12, 10];
  // 10% matches everything (no narrowing), 50% matches nothing
  expect(discountOptions(pcts)).toEqual([
    { min: 20, count: 4 },
    { min: 30, count: 3 },
    { min: 40, count: 2 },
  ]);
  expect(discountOptions(pcts, 50).at(-1)).toEqual({ min: 50, count: 0 });
  expect(discountOptions([])).toEqual([]);
});
