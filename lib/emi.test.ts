import { expect, it } from 'vitest';
import { EMI_MIN_MINOR, emiFrom, emiPlans } from './emi';

it('only India, from ₹3,000', () => {
  expect(emiPlans('US', 1_000_000)).toEqual([]);
  expect(emiPlans('IN', EMI_MIN_MINOR - 1)).toEqual([]);
  expect(emiPlans('IN', EMI_MIN_MINOR)).toHaveLength(4);
  expect(emiFrom([])).toBeNull();
});

it('3 and 6 months at no cost; 9 and 12 with the bank’s interest, rounded up to the rupee', () => {
  const plans = emiPlans('IN', 1_499_900); // ₹14,999
  expect(plans.map((p) => [p.months, p.noCost])).toEqual([[3, true], [6, true], [9, false], [12, false]]);
  expect(plans[0]).toEqual({ months: 3, monthlyMinor: 500000, interestMinor: 0, noCost: true });
  expect(plans[1].monthlyMinor).toBe(250000);
  // 16% a year on the reducing balance: ₹1,361 a month over a year
  expect(plans[3].monthlyMinor).toBe(136100);
  expect(plans[3].interestMinor).toBe(136100 * 12 - 1_499_900);
  for (const p of plans) expect(p.monthlyMinor % 100).toBe(0);
  expect(emiFrom(plans)).toBe(136100);
});
