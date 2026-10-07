import { expect, it } from 'vitest';
import { limitNote, unitsLeft } from './purchase-limits';

it('works out what’s left of a limit: what the shopper hasn’t bought, the whole limit when unknown, none without one', () => {
  const allowance = new Map([['a', { limit: 3, bought: 1, left: 2 }]]);
  expect(unitsLeft({ id: 'a', maxPerCustomer: 3 }, allowance)).toBe(2);
  expect(unitsLeft({ id: 'b', maxPerCustomer: 2 }, allowance)).toBe(2);
  expect(unitsLeft({ id: 'c' }, allowance)).toBeNull();
});

it('says the limit, and how much of it is left', () => {
  expect(limitNote(3, null)).toBe('Limit 3 per customer');
  expect(limitNote(3, 3)).toBe('Limit 3 per customer');
  expect(limitNote(3, 1)).toBe('Limit 3 per customer · You can buy 1 more');
  expect(limitNote(3, 0)).toBe('Limit 3 per customer · You’ve bought 3');
});
