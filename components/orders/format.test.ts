import { expect, it } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import { byTimeText, cartEta, noRushText, orderPaymentText, orderView, paidWithText, orderWithinText, refundText, releaseDate, returnUntilText } from './format';
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

it('a delivered order says where it was left, or who it was handed to', () => {
  const order = {
    id: '114-2', market: 'US', currency: 'USD', status: 'placed', paymentMethod: 'giftcard', paymentLabel: 'Gift card',
    totals: { subtotalMinor: 1000, discountMinor: 0, shipMinor: 0, taxMinor: 0, totalMinor: 1000 },
    shipTo: { name: 'Alex Morgan', phone: '2065550123', line1: '410 Terry Ave N', city: 'Seattle', state: 'WA', postcode: '98109' },
    items: [], createdAt: '2026-10-06T17:00:00.000Z', placedAt: '2026-10-06T17:00:00.000Z',
    shippedAt: '2026-10-07T03:00:00.000Z', outForDeliveryAt: '2026-10-07T16:00:00.000Z', deliveredAt: '2026-10-07T18:30:00.000Z',
  } as Order;
  const now = new Date('2026-10-07T20:00:00.000Z');
  expect(orderView(order, amazon, now).window).toBe('Handed to Alex · Today, 11:30 AM');
  const left = orderView({ ...order, shipTo: { ...order.shipTo, dropoff: 'front_door' } }, amazon, now);
  expect(left).toMatchObject({ kicker: 'DELIVERED', window: 'Left at the front door · Today, 11:30 AM' });
  expect(orderView({ ...order, shipTo: { ...order.shipTo, dropoff: 'property_staff' } }, amazon, now).window).toBe('Handed to property staff · Today, 11:30 AM');
});

it('a pre-order says when it is released, and arrives from then', () => {
  const release = '2026-11-20T08:00:00.000Z'; // midnight PST
  const now = new Date('2026-10-07T17:00:00.000Z');
  expect(releaseDate(new Date(release), amazon)).toBe('November 20, 2026');
  expect(releaseDate(new Date('2026-11-19T18:30:00.000Z'), amazonIn)).toBe('20 November 2026');
  expect(cartEta(now, amazon, release).toISOString()).toBe('2026-11-21T19:30:00.000Z');
  expect(cartEta(now, amazon, null).getTime()).toBeLessThan(Date.parse(release));
  const order = {
    id: '114-2', market: 'US', currency: 'USD', status: 'placed', paymentMethod: 'giftcard', paymentLabel: 'Gift card',
    totals: { subtotalMinor: 1000, discountMinor: 0, shipMinor: 0, taxMinor: 0, totalMinor: 1000 },
    shipTo: { name: 'Alex Morgan', phone: '2065550123', line1: '1 Main St', city: 'Seattle', state: 'WA', postcode: '98121' },
    items: [], createdAt: now.toISOString(), placedAt: now.toISOString(), releaseAt: release,
    shippedAt: '2026-11-20T18:00:00.000Z', outForDeliveryAt: '2026-11-21T17:00:00.000Z', deliveredAt: '2026-11-21T19:30:00.000Z',
  } as Order;
  const waiting = orderView(order, amazon, now);
  expect(waiting).toMatchObject({ kicker: 'PRE-ORDER', headline: 'Arriving Saturday, November 21', window: 'Releases November 20, 2026 · ships that day' });
  expect(waiting.cancelUntil?.toISOString()).toBe('2026-11-20T18:00:00.000Z');
  // once it's out it's any other order
  expect(orderView(order, amazon, new Date('2026-11-20T20:00:00.000Z')).kicker).toBe('ON TIME');
});

it('tells a No-Rush order’s reward: to come, on its way, credited, or lost to a cancellation', () => {
  const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;
  const now = new Date('2026-10-10T12:00:00.000Z');
  const base = { status: 'placed', shipSpeed: 'no_rush', noRushReward: { amountMinor: 100 } } as unknown as Order;
  expect(noRushText({ ...base, shippedAt: '2026-10-12T00:00:00.000Z' }, now, money, amazon)).toBe(
    'No-Rush Shipping · $1.00 reward to your gift card balance when it ships',
  );
  expect(noRushText({ ...base, shippedAt: '2026-10-10T00:00:00.000Z' }, now, money, amazon)).toBe('No-Rush Shipping · $1.00 reward added to your gift card balance');
  expect(noRushText({ ...base, noRushReward: { amountMinor: 100, creditedAt: '2026-10-10T08:00:00.000Z' } }, now, money, amazon)).toBe(
    'No-Rush Shipping · $1.00 reward added to your gift card balance on October 10, 2026',
  );
  expect(noRushText({ ...base, status: 'cancelled' }, now, money, amazon)).toBe('No-Rush Shipping · no reward, as the order was cancelled');
  expect(noRushText({ ...base, shipSpeed: 'standard', noRushReward: undefined }, now, money, amazon)).toBeNull();
});

it('splits a refund of a split payment between how they paid and the balance', () => {
  const o = {
    market: 'US',
    currency: 'USD',
    status: 'cancelled',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    split: { balanceMinor: 3000, chargedMinor: 580 },
  } as unknown as Order;
  expect(orderPaymentText(o)).toBe('Visa ending 4242 + Gift card balance');
  expect(orderPaymentText({ ...o, split: undefined })).toBe('Visa ending 4242');
  expect(refundText({ ...o, refund: { status: 'pending', amountMinor: 1080, balanceMinor: 500 } }, amazon)).toBe(
    'Refund of $5.00 to Gift card balance · issued. Refund of $5.80 to Visa ending 4242 is processing.',
  );
  expect(refundText({ ...o, refund: { status: 'succeeded', amountMinor: 1080, balanceMinor: 500, refundedAt: '2026-10-08T12:00:00.000Z' } }, amazon)).toBe(
    'Refund of $5.80 to Visa ending 4242 and $5.00 to Gift card balance · issued October 8. Card refunds take 5–10 business days to show up.',
  );
  // all of it to the balance: nothing to wait for from the card
  expect(refundText({ ...o, refund: { status: 'succeeded', amountMinor: 2500, balanceMinor: 2500 } }, amazon)).toBe('Refund of $25.00 to Gift card balance · issued.');
  // an ordinary card refund reads as before
  expect(refundText({ ...o, split: undefined, refund: { status: 'pending', amountMinor: 1080 } }, amazon)).toBe('Refund of $10.80 to Visa ending 4242 is processing.');
});

it('says a Pay on Delivery order paid online ahead of the delivery was paid before delivery', () => {
  const order = {
    id: '403-1', market: 'IN', currency: 'INR', status: 'placed', paymentMethod: 'upi', paymentLabel: 'UPI',
    totals: { subtotalMinor: 219900, discountMinor: 0, shipMinor: 0, taxMinor: 0, totalMinor: 219900 },
    items: [], createdAt: '2026-10-06T17:00:00.000Z', placedAt: '2026-10-06T17:00:00.000Z',
  } as unknown as Order;
  expect(paidWithText(order)).toBe('UPI');
  expect(paidWithText({ ...order, prepaidAt: '2026-10-07T09:00:00.000Z' })).toBe('UPI · paid before delivery');
  expect(paidWithText({ ...order, prepaidAt: '2026-10-07T09:00:00.000Z', status: 'cancelled', refund: { status: 'succeeded', amountMinor: 219900 } } as Order)).toBe('UPI · refunded');
});
