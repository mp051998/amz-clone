import { expect, it } from 'vitest';
import { amazon } from './amazon';
import { holidayReturnBy } from './holiday-returns';
import { amazonIn } from './marketplace-in';

it('gives what’s bought in November and December in the US until the end of January 31', () => {
  const end = '2027-02-01T07:59:59.000Z'; // 23:59:59 PST
  expect(holidayReturnBy(amazon, '2026-11-01T07:00:00.000Z')?.toISOString()).toBe(end); // midnight PDT, Nov 1
  expect(holidayReturnBy(amazon, '2026-12-31T23:00:00.000Z')?.toISOString()).toBe(end);
  // still December 31 in Seattle
  expect(holidayReturnBy(amazon, '2027-01-01T07:30:00.000Z')?.toISOString()).toBe(end);
  expect(holidayReturnBy(amazon, '2026-11-01T06:59:00.000Z')).toBeNull(); // 11:59 PM, Oct 31
  expect(holidayReturnBy(amazon, '2027-01-01T08:00:00.000Z')).toBeNull();
  expect(holidayReturnBy(amazon, new Date('2026-10-09T12:00:00.000Z'))).toBeNull();
});

it('not in a store without holiday returns', () => {
  expect(holidayReturnBy(amazonIn, '2026-11-15T06:30:00.000Z')).toBeNull();
});
