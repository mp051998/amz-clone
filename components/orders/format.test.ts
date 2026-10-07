import { expect, it } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import { byTimeText, orderWithinText, returnUntilText } from './format';

it('counts down to the order-by time', () => {
  const now = new Date('2026-10-07T16:47:00.000Z');
  expect(orderWithinText(now, new Date('2026-10-07T19:00:00.000Z'))).toBe('Order within 2 hrs 13 mins');
  expect(orderWithinText(now, new Date('2026-10-07T17:47:00.000Z'))).toBe('Order within 1 hr');
  expect(orderWithinText(now, new Date('2026-10-07T17:32:00.000Z'))).toBe('Order within 45 mins');
  expect(orderWithinText(now, new Date('2026-10-07T16:47:30.000Z'))).toBeNull();
});

it('says when, by time of day, in the store time zone', () => {
  const now = new Date('2026-10-07T17:00:00.000Z'); // 10:00 PDT
  expect(byTimeText(new Date('2026-10-08T02:30:00.000Z'), amazon, now)).toBe('Today by 7:30 PM');
  expect(byTimeText(new Date('2026-10-09T02:30:00.000Z'), amazon, now)).toBe('Tomorrow by 7:30 PM');
});

it('gives one return-by date, or a later one for replacement items', () => {
  const first = new Date('2026-10-30T12:00:00.000Z');
  const last = new Date('2026-11-09T12:00:00.000Z');
  expect(returnUntilText({ first, last: first }, amazon)).toBe('until Friday, October 30');
  expect(returnUntilText({ first, last }, amazon)).toBe('until Friday, October 30; replacement items until Monday, November 9');
  expect(returnUntilText({ first, last }, amazonIn)).toBe('until Friday, 30 October; replacement items until Monday, 9 November');
});
