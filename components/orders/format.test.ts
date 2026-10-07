import { expect, it } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import { byTimeText, orderView, orderWithinText, returnUntilText } from './format';
import type { Order } from '@/lib/types';

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

it('a pickup order is ready for pickup, at its point, once delivered', () => {
  const order = {
    id: '114-1', market: 'US', currency: 'USD', status: 'placed', paymentMethod: 'giftcard', paymentLabel: 'Gift card',
    totals: { subtotalMinor: 1000, discountMinor: 0, shipMinor: 0, taxMinor: 0, totalMinor: 1000 },
    shipTo: { name: 'Alex Morgan', phone: '2065550123', line1: 'Hub Locker – Juniper', line2: '2121 7th Ave', city: 'Seattle', state: 'WA', postcode: '98121' },
    items: [], createdAt: '2026-10-06T17:00:00.000Z', placedAt: '2026-10-06T17:00:00.000Z',
    shippedAt: '2026-10-07T03:00:00.000Z', outForDeliveryAt: '2026-10-07T16:00:00.000Z', deliveredAt: '2026-10-07T18:30:00.000Z',
    pickup: { pointId: 'US-SEA-JUNIPER', code: '042137' },
  } as Order;
  const ready = orderView(order, amazon, new Date('2026-10-07T20:00:00.000Z'));
  expect(ready).toMatchObject({ kicker: 'READY FOR PICKUP', headline: 'Ready for pickup', chip: { label: 'Ready for pickup', tone: 'good' } });
  expect(ready.window).toBe('At Hub Locker – Juniper · Today, 11:30 AM');
  expect(ready.steps.at(-1)).toMatchObject({ label: 'Ready for pickup', state: 'current' });
  const coming = orderView(order, amazon, new Date('2026-10-07T10:00:00.000Z'));
  expect(coming.headline).toBe('Arriving today');
  expect(coming.steps.at(-1)).toMatchObject({ label: 'Ready for pickup', state: 'upcoming' });
});
