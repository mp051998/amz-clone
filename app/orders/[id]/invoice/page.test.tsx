import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order, OrderReturn } from '@/lib/types';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', email: 'a@b.test' } as unknown,
  order: null as unknown,
  returns: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/orders', () => ({ getOrder: async () => state.order }));
vi.mock('@/lib/data/returns', () => ({ getOrderReturns: async () => ({ delivered: true, returnable: {}, returns: state.returns }) }));

import InvoicePage from './page';

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'ORD-77',
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 5000, shipMinor: 0, taxMinor: 413, totalMinor: 5413 },
    shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [
      { productId: 'a', title: 'Kettle', image: '', seller: 'Kettle Co', unitPriceMinor: 1500, qty: 2 },
      { productId: 'b', title: 'Mug', image: '', seller: 'Store', unitPriceMinor: 2000, qty: 1 },
    ],
    createdAt: '2026-10-01T10:00:00Z',
    placedAt: '2026-10-01T10:00:05Z',
    ...over,
  };
}

async function show(id = 'ORD-77') {
  render(await InvoicePage({ params: Promise.resolve({ id }) }));
}

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1' };
  state.order = order();
  state.returns = [];
});

it('prints the order: number, address, each line, totals, payment', async () => {
  await show();
  expect(screen.getByRole('heading', { level: 1, name: 'Invoice' })).toBeInTheDocument();
  expect(screen.getByText('ORD-77')).toBeInTheDocument();
  expect(screen.getByText('Asha Rao')).toBeInTheDocument();
  expect(screen.getByText('Austin, TX 78701')).toBeInTheDocument();
  expect(screen.getByText('Visa ending 4242')).toBeInTheDocument();
  const rows = within(screen.getByRole('table')).getAllByRole('row');
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getByText('Kettle')).toBeInTheDocument();
  expect(within(rows[1]).getByText('Sold by Kettle Co')).toBeInTheDocument();
  expect(within(rows[1]).getByText('$30.00')).toBeInTheDocument();
  expect(screen.getByText('FREE')).toBeInTheDocument();
  expect(screen.getByText('$4.13')).toBeInTheDocument();
  expect(screen.getAllByText('$54.13').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Print invoice' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← Back to order' })).toHaveAttribute('href', '/orders/ORD-77?placed=0');
  expect(screen.queryByRole('heading', { name: 'Refunds' })).toBeNull();
});

it('lists return refunds and what was paid after them', async () => {
  state.returns = [
    {
      id: 'R1', orderId: 'ORD-77', status: 'received', reason: 'damaged', resolution: 'refund',
      items: [{ productId: 'a', title: 'Kettle', image: '', unitPriceMinor: 1500, qty: 1 }],
      itemsMinor: 1500, taxMinor: 124, shipMinor: 0, refundMinor: 1624,
      refund: { status: 'succeeded', refundedAt: '2026-10-04T12:00:00Z' }, dropoffCode: 'X', dropoffBy: '2026-10-10',
      createdAt: '2026-10-03T12:00:00Z', receivedAt: '2026-10-04T11:00:00Z',
    } satisfies OrderReturn,
  ];
  await show();
  const refunds = screen.getByRole('heading', { name: 'Refunds' }).parentElement!;
  expect(within(refunds).getByText('Return of 1 item')).toBeInTheDocument();
  expect(within(refunds).getByText('−$16.24')).toBeInTheDocument();
  expect(within(refunds).getByText('$37.89')).toBeInTheDocument();
});

it('a cancelled order is an order summary with its refund', async () => {
  state.order = order({ status: 'cancelled', refund: { status: 'pending', amountMinor: 5413 } });
  await show();
  expect(screen.getByRole('heading', { level: 1, name: 'Order summary' })).toBeInTheDocument();
  expect(screen.getByText('Cancelled')).toBeInTheDocument();
  expect(screen.getByText('Order cancelled')).toBeInTheDocument();
  expect(screen.getByText(/Processing/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Print summary' })).toBeInTheDocument();
});

it('India: tax included note, rupees, store links', async () => {
  state.store = amazonIn;
  state.order = order({ market: 'IN', currency: 'INR', paymentMethod: 'cod', paymentLabel: 'Cash on delivery', totals: { subtotalMinor: 199900, shipMinor: 4000, taxMinor: 0, totalMinor: 203900 } });
  await show();
  expect(screen.getByText('Inclusive of all taxes')).toBeInTheDocument();
  expect(screen.getByText('Pay on delivery')).toBeInTheDocument();
  expect(screen.getAllByText('₹2,039').length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: '← Back to order' })).toHaveAttribute('href', '/in/orders/ORD-77?placed=0');
});

it('sends the signed-out to sign in, the wrong store to the right one, and unpaid orders back', async () => {
  state.user = null;
  await expect(show()).rejects.toThrow('REDIRECT /signin?next=%2Forders%2FORD-77%2Finvoice');
  state.user = { id: 'u1' };
  state.order = order({ market: 'IN', currency: 'INR' });
  await expect(show()).rejects.toThrow('REDIRECT /in/orders/ORD-77/invoice');
  state.order = order({ status: 'awaiting_payment' });
  await expect(show()).rejects.toThrow('REDIRECT /orders/ORD-77?placed=0');
  state.order = null;
  await expect(show()).rejects.toThrow('NOT_FOUND');
});
