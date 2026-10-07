import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { amazon } from '@/lib/amazon';
import type { OrderReturn } from '@/lib/types';
import { ReturnCard } from './Returns';

afterEach(cleanup);

const swap: OrderReturn = {
  id: 'r1',
  orderId: '114-0000000-0000000',
  status: 'requested',
  reason: 'damaged',
  resolution: 'replacement',
  replacement: { shippedAt: '2026-10-08T03:00:00Z', deliveredAt: '2026-10-09T18:30:00Z' },
  items: [{ productId: 'p1', title: 'Lamp', image: '', unitPriceMinor: 2000, qty: 1 }],
  itemsMinor: 0,
  taxMinor: 0,
  shipMinor: 0,
  refundMinor: 0,
  dropoffCode: 'AB12-CD34',
  dropoffBy: '2026-10-21T00:00:00Z',
  createdAt: '2026-10-07T17:00:00Z',
};

const card = (r: OrderReturn, now: string, cancel?: () => Promise<void>) =>
  render(<ReturnCard r={r} currency="USD" market="US" method="card" label="Visa ending 4242" store={amazon} now={new Date(now)} cancel={cancel} />);

it('a replacement on its way says when it arrives and where to drop the original, with no refund', () => {
  card(swap, '2026-10-07T18:00:00Z', async () => {});
  expect(screen.getByText('Replacement on its way')).toBeTruthy();
  const lead = screen.getByText(/Your replacement arrives by/);
  expect(lead.textContent).toMatch(/at no charge\. Drop the original off by .+ and show this code: AB12-CD34\./);
  expect(screen.getByText('Replacement · no charge')).toBeTruthy();
  expect(screen.queryByText(/Refund/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Cancel replacement' })).toBeTruthy();
});

it('says once it has shipped, and when it was delivered', () => {
  card(swap, '2026-10-08T12:00:00Z');
  expect(screen.getByText(/Your replacement has shipped and arrives by/)).toBeTruthy();
  cleanup();
  card({ ...swap, status: 'received', refund: { status: 'succeeded' }, receivedAt: '2026-10-12T00:00:00Z' }, '2026-10-12T12:00:00Z');
  expect(screen.getByText('Replacement delivered')).toBeTruthy();
  expect(screen.getByText(/was delivered on .+ We’ve received the original, so there’s nothing more to do\./)).toBeTruthy();
});

it('a cancelled replacement was never sent', () => {
  card({ ...swap, status: 'cancelled', cancelledAt: '2026-10-07T18:00:00Z' }, '2026-10-07T19:00:00Z');
  expect(screen.getByText(/You cancelled this replacement.+Nothing was sent\./)).toBeTruthy();
});

it('a missing package was refunded without anything coming back', () => {
  const missing: OrderReturn = { ...swap, status: 'received', reason: 'not_received', resolution: 'refund', replacement: undefined, itemsMinor: 2000, taxMinor: 160, refundMinor: 2160, receivedAt: '2026-10-07T17:00:00Z' };
  card({ ...missing, refund: { status: 'pending' } }, '2026-10-07T18:00:00Z');
  expect(screen.getByText(/^Reported .+ · Package didn’t arrive$/)).toBeTruthy();
  expect(screen.getByText('The refund of $21.60 to Visa ending 4242 is on its way.')).toBeTruthy();
  expect(screen.queryByText(/We received your return/)).toBeNull();
  cleanup();
  card({ ...missing, refund: { status: 'succeeded', refundedAt: '2026-10-07T17:00:00Z' } }, '2026-10-07T18:00:00Z');
  expect(screen.getByText('Refunded')).toBeTruthy();
  expect(screen.getByText(/\$21\.60 refunded to Visa ending 4242 on/)).toBeTruthy();
});

it('a missing package sent again has nothing to drop off or refund', () => {
  const resent: OrderReturn = { ...swap, status: 'received', reason: 'not_received', refund: { status: 'succeeded' }, receivedAt: '2026-10-07T17:00:00Z' };
  card(resent, '2026-10-07T18:00:00Z');
  expect(screen.getByText(/^Reported .+ · Package didn’t arrive$/)).toBeTruthy();
  expect(screen.getByText('Replacement on its way')).toBeTruthy();
  expect(screen.getByText(/Your replacement arrives by/).textContent).toMatch(/arrives by .+, at no charge\. There’s nothing to send back\.$/);
  expect(screen.queryByText(/Drop the original|AB12-CD34|received the original/)).toBeNull();
  expect(screen.getByText('Replacement · no charge')).toBeTruthy();
  cleanup();
  card(resent, '2026-10-10T12:00:00Z');
  expect(screen.getByText('Replacement delivered')).toBeTruthy();
  expect(screen.getByText(/Your replacement was delivered on .+ There’s nothing to send back\./)).toBeTruthy();
});

it('a refund asked for on the balance says it went there, with no wait for the card', () => {
  const refund: OrderReturn = { ...swap, resolution: 'refund', replacement: undefined, reason: 'better_price', itemsMinor: 2000, taxMinor: 160, refundMinor: 2160, refundToBalance: true };
  card(refund, '2026-10-07T18:00:00Z');
  expect(screen.getByText(/We’ll refund \$21\.60 to your gift card balance once it reaches us\./)).toBeTruthy();
  cleanup();
  card({ ...refund, status: 'received', receivedAt: '2026-10-09T00:00:00Z', refund: { status: 'succeeded', refundedAt: '2026-10-09T00:00:00Z' } }, '2026-10-09T12:00:00Z');
  expect(screen.getByText(/\$21\.60 refunded to your gift card balance on/)).toBeTruthy();
  expect(screen.queryByText(/Card refunds take/)).toBeNull();
});
