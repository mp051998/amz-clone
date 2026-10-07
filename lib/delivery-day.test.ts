import { expect, it } from 'vitest';
import { isWeekday, weekdayName, WEEKDAYS } from './delivery-day';

it('names ISO weekdays, Monday first', () => {
  expect(WEEKDAYS).toHaveLength(7);
  expect(weekdayName(1)).toBe('Monday');
  expect(weekdayName(5)).toBe('Friday');
  expect(weekdayName(7)).toBe('Sunday');
  expect(weekdayName(0)).toBe('');
  expect(weekdayName(8)).toBe('');
});

it('accepts whole numbers 1–7 only', () => {
  expect([1, 4, 7].every(isWeekday)).toBe(true);
  expect([0, 8, 2.5, '3', null, undefined, NaN].some(isWeekday)).toBe(false);
});
