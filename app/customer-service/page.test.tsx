import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/types';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1' } as unknown,
  orders: [] as unknown[],
  limits: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/support', () => ({ unreadCaseIds: async () => new Set<string>() }));
vi.mock('@/lib/data/orders', () => ({
  listOrders: async (_db: unknown, _market: string, opts: unknown) => {
    state.limits.push(opts);
    return state.orders;
  },
}));

import CustomerServicePage from './page';

function order(id: string, daysAgo: number, titles = ['Electric Kettle'], over: Partial<Order> = {}): Order {
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
    items: titles.map((title, i) => ({ productId: `${id}-${i}`, title, image: '', seller: 'Store', unitPriceMinor: 1000, qty: 1 })),
    createdAt: at,
    placedAt: at,
    deliveredAt: at,
    ...over,
  };
}

const recent = () => screen.queryByRole('heading', { name: 'Get help with a recent order' })?.closest('section') ?? null;

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1' };
  state.limits = [];
  state.orders = [
    order('ORD-1', 2, ['Sony Headphones', 'Ceramic Mug', 'Desk Lamp']),
    order('ORD-2', 5, ['Electric Kettle'], { placedAt: undefined }),
    order('ORD-3', 9),
    order('ORD-4', 12),
    order('ORD-5', 20),
    order('ORD-6', 30),
  ];
});

it('offers the latest placed orders to get help with, each opening a case about it', async () => {
  render(await CustomerServicePage());
  const section = recent()!;
  const links = within(section).getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('contact'));
  // the unpaid one is left out; four at most
  expect(links.map((a) => a.getAttribute('href'))).toEqual(['ORD-1', 'ORD-3', 'ORD-4', 'ORD-5'].map((id) => `/customer-service/contact?order=${id}`));
  expect(links[0]).toHaveTextContent('Sony Headphones and 2 more');
  expect(links[0]).toHaveTextContent(/Delivered/);
  expect(within(section).getByRole('link', { name: 'See all orders' })).toHaveAttribute('href', '/orders');
  expect(state.limits).toEqual([{ limit: 8 }]);
});

it('keeps the links in the store', async () => {
  state.store = amazonIn;
  state.orders = [order('ORD-9', 1, ['Steel Bottle'], { market: 'IN', currency: 'INR' })];
  render(await CustomerServicePage());
  expect(within(recent()!).getByRole('link', { name: /Steel Bottle/ })).toHaveAttribute('href', '/in/customer-service/contact?order=ORD-9');
  expect(screen.getByRole('link', { name: /Payments & gift cards/ })).toHaveAttribute('href', '/in/account/payments');
  expect(screen.getByRole('link', { name: /Login & security/ })).toHaveAttribute('href', '/in/account/security');
});

it('has no recent orders when signed out or with none placed', async () => {
  state.user = null;
  render(await CustomerServicePage());
  expect(recent()).toBeNull();
  expect(state.limits).toEqual([]);
  cleanup();

  state.user = { id: 'u1' };
  state.orders = [];
  render(await CustomerServicePage());
  expect(recent()).toBeNull();
  expect(screen.getByRole('heading', { name: 'Quick actions' })).toBeInTheDocument();
});

it('browses help topics on their own pages, not a product search', async () => {
  render(await CustomerServicePage());
  const topics = screen.getByRole('heading', { name: 'Browse help topics' }).closest('section')!;
  expect(within(topics).getByRole('link', { name: /Shipping & delivery/ })).toHaveAttribute('href', '/customer-service/help/shipping-delivery');
  expect(within(topics).getAllByRole('link').every((a) => a.getAttribute('href')!.startsWith('/customer-service/help/'))).toBe(true);
});
