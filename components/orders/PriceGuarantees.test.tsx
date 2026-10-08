import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import type { Order, OrderCancellation } from '@/lib/types';
import { CancelledItems } from './CancelledItems';
import { priceGuaranteeChip, priceGuarantees, PriceGuarantees } from './PriceGuarantees';

// the decision kit's barrel reaches server-only modules; CancelledItems only needs its frame
vi.mock('@/components/decision', () => ({ ProductFrame: () => null }));

afterEach(cleanup);

const drop = (over: Partial<OrderCancellation> = {}): OrderCancellation => ({
  id: 'g1',
  items: [],
  priceGuarantee: { productId: 'g', title: 'Starfall (PS5)', priceMinor: 4500, qty: 2 },
  itemsMinor: 1000,
  taxMinor: 80,
  refund: { status: 'pending', amountMinor: 1080 },
  createdAt: '2026-10-05T17:00:00Z',
  ...over,
});

const cancelled: OrderCancellation = {
  id: 'c1',
  items: [{ productId: 'm', title: 'Mug', image: '', seller: 'Store', unitPriceMinor: 1200, qty: 1 }],
  itemsMinor: 1200,
  taxMinor: 0,
  refund: { status: 'succeeded', amountMinor: 1200, refundedAt: '2026-10-04T10:00:00Z' },
  createdAt: '2026-10-04T10:00:00Z',
};

const order = (cancellations: OrderCancellation[], over: Partial<Order> = {}): Order => ({
  id: '114-0000000-0000000',
  market: 'US',
  currency: 'USD',
  status: 'placed',
  paymentMethod: 'card',
  paymentLabel: 'Visa ending 4242',
  totals: { subtotalMinor: 10000, discountMinor: 1000, guaranteeMinor: 1000, shipMinor: 0, taxMinor: 720, totalMinor: 9720 },
  shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
  items: [{ productId: 'g', title: 'Starfall (PS5)', image: '', seller: 'Store', unitPriceMinor: 5000, qty: 2, unitDiscountMinor: 500, unitGuaranteeMinor: 500 }],
  createdAt: '2026-10-01T09:00:00Z',
  placedAt: '2026-10-01T09:00:00Z',
  cancellations,
  ...over,
});

const href = (id: string) => `/product/${id}`;

it('says the price dropped before release, by how much, and where the difference goes', () => {
  render(<PriceGuarantees order={order([cancelled, drop()])} store={amazon} href={href} />);
  expect(screen.getByRole('heading', { name: 'Pre-order Price Guarantee' })).toBeTruthy();
  expect(screen.getByText('Refund processing')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Starfall (PS5)' }).getAttribute('href')).toBe('/product/g');
  expect(screen.getByText(/dropped to \$45\.00 before its release, so you pay the lower price: \$10\.00 less for 2 items\./)).toBeTruthy();
  expect(screen.getByText(/Refund of \$10\.80 to Visa ending 4242 is processing\./)).toBeTruthy();
  expect(screen.getByText('Includes $0.80 tax.', { exact: false })).toBeTruthy();
  // the cancelled items stay under their own heading
  expect(screen.getAllByRole('article')).toHaveLength(1);
});

it('a pay-on-delivery order just costs less when it arrives', () => {
  render(<PriceGuarantees order={order([drop({ taxMinor: 0, refund: { status: 'not_charged', amountMinor: 1000 } })], { paymentMethod: 'cod', paymentLabel: 'Pay on delivery' })} store={amazon} href={href} />);
  expect(screen.getByText('Price lowered')).toBeTruthy();
  expect(screen.getByText('You’ll pay $10.00 less when it arrives.')).toBeTruthy();
  expect(screen.queryByText(/Includes/)).toBeNull();
});

it('shows nothing without a price drop, and cancelled items leave price drops out', () => {
  const { container } = render(<PriceGuarantees order={order([cancelled])} store={amazon} href={href} />);
  expect(container.innerHTML).toBe('');
  cleanup();
  render(<CancelledItems order={order([cancelled, drop()])} store={amazon} href={href} />);
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('Mug')).toBeTruthy();
  expect(screen.queryByText(/Starfall/)).toBeNull();
  cleanup();
  const { container: none } = render(<CancelledItems order={order([drop()])} store={amazon} href={href} />);
  expect(none.innerHTML).toBe('');
});

it('labels each refund state', () => {
  expect(priceGuarantees(order([cancelled, drop()])).map((c) => c.id)).toEqual(['g1']);
  expect(priceGuaranteeChip(drop({ refund: { status: 'succeeded', amountMinor: 1080, refundedAt: '2026-10-05T17:01:00Z' } })).label).toBe('Refunded');
  expect(priceGuaranteeChip(drop({ refund: { status: 'failed', amountMinor: 1080 } })).label).toBe('Refund delayed');
});
