import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/types';
import { amazon } from '@/lib/amazon';

const state = vi.hoisted(() => ({ order: null as unknown }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => amazon }));
vi.mock('@/lib/auth', () => ({ readUser: async () => ({ id: 'u1', email: 'a@b.test' }) }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/orders', () => ({ getOrder: async () => state.order }));
vi.mock('@/app/actions/order', () => ({ cancelMyItems: async () => {} }));

import CancelItemsPage from './page';

const FUTURE = { shippedAt: '2998-12-30T10:00:00Z', outForDeliveryAt: '2999-01-01T08:00:00Z', deliveredAt: '2999-01-01T10:00:00Z' };

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'ORD-9',
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 3000, shipMinor: 0, taxMinor: 0, totalMinor: 3000 },
    shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [
      { productId: 'k', title: 'Kettle', image: '', seller: 'Store', unitPriceMinor: 1000, qty: 1, unitDiscountMinor: 100 },
      { productId: 'm', title: 'Mug', image: '', seller: 'Store', unitPriceMinor: 1000, qty: 2 },
    ],
    createdAt: '2026-09-01T10:00:00Z',
    placedAt: '2026-09-01T10:00:00Z',
    ...FUTURE,
    ...over,
  };
}

async function show(params: Record<string, string> = {}) {
  render(await CancelItemsPage({ params: Promise.resolve({ id: 'ORD-9' }), searchParams: Promise.resolve(params) }));
}

afterEach(cleanup);
beforeEach(() => {
  state.order = order();
});

it('lists each item to tick, none ticked, with what it cost', async () => {
  await show();
  expect(screen.getByRole('heading', { name: 'Cancel items' })).toBeInTheDocument();
  const kettle = screen.getByRole('checkbox', { name: 'Kettle' });
  expect(kettle).toHaveAttribute('name', 'item');
  expect(kettle).toHaveAttribute('value', 'k');
  expect(kettle).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Mug' })).not.toBeChecked();
  expect(screen.getByText('Qty 1 · $9.00 after coupon')).toBeInTheDocument();
  expect(screen.getByText('Qty 2 · $20.00')).toBeInTheDocument();
  expect(screen.getByText(/to Visa ending 4242\./)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel checked items' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Keep everything' })).toHaveAttribute('href', '/orders/ORD-9');
});

it('says what went wrong', async () => {
  await show({ error: 'invalid_input' });
  expect(screen.getByText('Choose at least one item to cancel.')).toBeInTheDocument();
});

it('cash on delivery has nothing to refund', async () => {
  state.order = order({ paymentMethod: 'cod', paymentLabel: 'Cash on delivery' });
  await show();
  expect(screen.getByText(/Nothing has been charged yet/)).toBeInTheDocument();
});

it('not once it has shipped, nor for a cancelled order', async () => {
  state.order = order({ shippedAt: '2026-09-01T20:00:00Z' });
  await show();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByText(/already shipped/)).toBeInTheDocument();
  cleanup();
  state.order = order({ status: 'cancelled' });
  await show();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByText('This order is already cancelled.')).toBeInTheDocument();
});

it('another store’s order goes to that store', async () => {
  state.order = order({ market: 'IN' });
  await expect(show()).rejects.toThrow('REDIRECT /in/orders/ORD-9/cancel');
});
