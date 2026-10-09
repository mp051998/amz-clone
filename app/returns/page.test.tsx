import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order, OrderReturn } from '@/lib/types';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1' } as unknown,
  orders: [] as unknown[],
  withReturns: [] as string[],
  returns: {} as Record<string, unknown[]>,
  asked: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/orders', () => ({ listOrders: async () => state.orders }));
vi.mock('@/lib/data/returns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/returns')>()),
  ordersWithReturns: async () => state.withReturns,
  getOrderReturns: async (_db: unknown, id: string) => {
    state.asked.push(id);
    return { delivered: true, returnByItem: {}, returnable: {}, replaceable: {}, returns: state.returns[id] ?? [] };
  },
}));

import ReturnsPage from './page';

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day).toISOString();

function order(id: string, over: Partial<Order> = {}): Order {
  return {
    id,
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 2000, shipMinor: 0, taxMinor: 0, totalMinor: 2000 },
    shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [{ productId: 'p1', title: 'Lamp', image: '', seller: 'Store', unitPriceMinor: 2000, qty: 1 }],
    createdAt: ago(20),
    placedAt: ago(20),
    deliveredAt: ago(15),
    ...over,
  };
}

function ret(id: string, orderId: string, title: string, over: Partial<OrderReturn> = {}): OrderReturn {
  return {
    id,
    orderId,
    status: 'requested',
    reason: 'no_longer_needed',
    resolution: 'refund',
    items: [{ productId: 'p1', title, image: '', unitPriceMinor: 2000, qty: 1 }],
    itemsMinor: 2000,
    taxMinor: 0,
    shipMinor: 0,
    refundMinor: 2000,
    dropoffCode: 'AB12-CD34',
    dropoffBy: new Date(Date.now() + 10 * day).toISOString(),
    createdAt: ago(5),
    ...over,
  };
}

async function show() {
  render(await ReturnsPage());
}

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1' };
  state.orders = [order('ORD-1'), order('ORD-2'), order('ORD-3')];
  state.withReturns = [];
  state.returns = {};
  state.asked = [];
});

it('asks a signed-out shopper to sign in first', async () => {
  state.user = null;
  await expect(show()).rejects.toThrow('REDIRECT /signin?next=/returns');
});

it('lists returns in progress, then completed ones, each with its order', async () => {
  // ORD-X is the other store's order: its returns aren't this store's
  state.withReturns = ['ORD-2', 'ORD-X', 'ORD-1'];
  state.returns = {
    'ORD-1': [ret('r1', 'ORD-1', 'Desk Lamp', { status: 'received', refund: { status: 'succeeded', refundedAt: ago(2) }, createdAt: ago(9) })],
    'ORD-2': [
      ret('r2', 'ORD-2', 'Kettle', { createdAt: ago(1) }),
      ret('r3', 'ORD-2', 'Mug', { status: 'cancelled', createdAt: ago(3) }),
    ],
  };
  await show();
  expect(screen.getByRole('heading', { level: 1, name: 'Your returns' })).toBeInTheDocument();
  expect(state.asked).toEqual(['ORD-2', 'ORD-1']);

  const open = screen.getByRole('region', { name: 'In progress (1)' });
  const sending = within(open).getByRole('article', { name: 'Return' });
  expect(sending).toHaveTextContent('Kettle');
  expect(sending).toHaveTextContent('Return started');
  expect(sending).toHaveTextContent('AB12-CD34');
  expect(sending).toHaveTextContent('We’ll refund $20.00 to Visa ending 4242 once it reaches us.');
  expect(within(open).getByRole('link', { name: 'View return details in order ORD-2' })).toHaveAttribute('href', '/orders/ORD-2?placed=0#returns-h');

  const done = screen.getByRole('region', { name: 'Completed (2)' });
  const cards = within(done).getAllByRole('article', { name: 'Return' });
  // newest first
  expect(cards.map((c) => c.querySelector('p')?.textContent)).toEqual(['Mug', 'Desk Lamp']);
  expect(cards[1]).toHaveTextContent('Refunded');
  expect(within(done).getByRole('link', { name: 'View return details in order ORD-1' })).toBeInTheDocument();
  // changing or cancelling one stays on the order's page
  expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
});

it('says when there are no returns yet', async () => {
  await show();
  expect(screen.getByText('No returns')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to Your Orders' })).toHaveAttribute('href', '/orders');
  expect(screen.queryByRole('region')).toBeNull();
});

it('stays in the India store', async () => {
  state.store = amazonIn;
  state.orders = [order('ORD-IN', { market: 'IN', currency: 'INR', paymentMethod: 'cod', paymentLabel: 'Cash on Delivery' })];
  state.withReturns = ['ORD-IN'];
  state.returns = { 'ORD-IN': [ret('r9', 'ORD-IN', 'Pressure Cooker', { refundMinor: 149900, itemsMinor: 149900 })] };
  await show();
  expect(screen.getByRole('link', { name: 'View return details in order ORD-IN' })).toHaveAttribute('href', '/in/orders/ORD-IN?placed=0#returns-h');
  expect(screen.getByRole('link', { name: 'Return items from an order' })).toHaveAttribute('href', '/in/orders');
  expect(screen.getByRole('article', { name: 'Return' })).toHaveTextContent('to your bank account');
});
