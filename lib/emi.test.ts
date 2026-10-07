import { expect, it } from 'vitest';
import { EMI_MIN_MINOR, emiFrom, emiPlan, emiPlans, emiText, isEmiMonths } from './emi';

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

it('an order keeps its plan below the minimum, and says what it costs a month', () => {
  expect(emiPlan(200000, 6)).toEqual({ months: 6, monthlyMinor: 33400, interestMinor: 0, noCost: true });
  const inr = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN')}`;
  expect(emiText(1_499_900, 6, inr)).toBe('₹2,500/month for 6 months · No Cost EMI');
  expect(emiText(1_499_900, 12, inr)).toBe(`₹1,361/month for 12 months · ${inr(136100 * 12 - 1_499_900)} interest`);
  expect([3, 6, 9, 12].every(isEmiMonths)).toBe(true);
  expect([0, 4, 24, '6', null].some(isEmiMonths)).toBe(false);
});
