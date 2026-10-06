import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/types';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1' } as unknown,
  orders: [] as unknown[],
  returnsFor: [] as string[][],
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
vi.mock('@/lib/data/returns', () => ({
  returnSummaries: async (_db: unknown, ids: string[]) => {
    state.returnsFor.push(ids);
    return new Map();
  },
}));

import OrdersPage from './page';

function order(id: string, daysAgo: number, title = 'Electric Kettle'): Order {
  const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    id,
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 1000, shipMinor: 0, taxMinor: 0, totalMinor: 1000 },
    shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [{ productId: id, title, image: '', seller: 'Store', unitPriceMinor: 1000, qty: 1 }],
    createdAt: at,
    placedAt: at,
    deliveredAt: at,
  };
}

async function show(params: Record<string, string> = {}) {
  render(await OrdersPage({ searchParams: Promise.resolve(params) }));
}

const listed = () => screen.queryAllByRole('link', { name: /^Track order/ }).map((a) => a.getAttribute('aria-label')!.replace('Track order ', ''));

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1' };
  state.orders = [order('ORD-1', 2, 'Sony Headphones'), order('ORD-2', 40), order('ORD-3', 200, 'Ceramic Mug'), order('ORD-4', 500)];
  state.returnsFor = [];
});

it('shows the past 3 months by default, with the other periods to pick from', async () => {
  await show();
  expect(listed()).toEqual(['ORD-1', 'ORD-2']);
  expect(screen.getByRole('status')).toHaveTextContent('2 orders placed in the past 3 months');
  const periods = screen.getByRole('group', { name: 'Orders placed in' });
  expect(within(periods).getByRole('link', { name: 'Past 3 months' })).toHaveAttribute('aria-current', 'true');
  expect(within(periods).getByRole('link', { name: 'Last 30 days' })).toHaveAttribute('href', '/orders?period=last30');
  expect(within(periods).getByRole('link', { name: 'All' })).toHaveAttribute('href', '/orders?period=all');
  // only the shown orders' returns are looked up
  expect(state.returnsFor).toEqual([['ORD-1', 'ORD-2']]);
});

it('narrows to a period', async () => {
  await show({ period: 'last30' });
  expect(listed()).toEqual(['ORD-1']);
  expect(screen.getByRole('status')).toHaveTextContent('1 order placed in the last 30 days');
});

it('searches every order, whatever the period, and can clear the search', async () => {
  await show({ q: 'mug', period: 'last30' });
  expect(listed()).toEqual(['ORD-3']);
  expect(screen.getByRole('searchbox', { name: 'Search all orders' })).toHaveValue('mug');
  expect(screen.getByRole('status')).toHaveTextContent('1 order matching “mug”');
  expect(screen.getByRole('link', { name: 'Clear search' })).toHaveAttribute('href', '/orders?period=last30');
  expect(screen.queryByRole('group', { name: 'Orders placed in' })).toBeNull();
});

it('says when nothing matched and offers every order', async () => {
  await show({ q: 'trampoline' });
  expect(screen.getByText('No orders match “trampoline”')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'See all orders' })).toHaveAttribute('href', '/orders?period=all');
});

it('pages ten at a time, keeping the view in the page links (India store paths)', async () => {
  state.store = amazonIn;
  state.orders = Array.from({ length: 12 }, (_, i) => ({ ...order(`ORD-${i}`, 1), market: 'IN', currency: 'INR' }));
  await show({ period: 'all', page: '2' });
  expect(listed()).toEqual(['ORD-10', 'ORD-11']);
  const pages = screen.getByRole('navigation', { name: 'Pagination' });
  expect(within(pages).getByRole('link', { name: '1' })).toHaveAttribute('href', '/in/orders?period=all');
  expect(within(pages).getByText('2')).toHaveAttribute('aria-current', 'page');
});

it('first-time shoppers see the plain empty state, without the tools', async () => {
  state.orders = [];
  await show();
  expect(screen.getByText('No orders yet')).toBeInTheDocument();
  expect(screen.queryByRole('search')).toBeNull();
});

it('sends the signed-out to sign in', async () => {
  state.user = null;
  await expect(show()).rejects.toThrow('REDIRECT /signin?next=/orders');
});

it('an unpaid card order links to finishing payment instead of tracking', async () => {
  state.orders = [{ ...order('ORD-1', 1), status: 'awaiting_payment', deliveredAt: undefined }, order('ORD-2', 3)];
  await show();
  expect(screen.getByRole('link', { name: 'Complete payment for order ORD-1' })).toHaveAttribute('href', '/orders/ORD-1?placed=0');
  expect(listed()).toEqual(['ORD-2']);
});
