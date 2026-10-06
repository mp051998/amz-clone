import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', name: 'Asha', email: 'asha@example.com' } as unknown,
  orders: 2,
  recent: [] as string[],
  paused: false,
  plus: null as { since: string } | null,
  balance: 0 as number | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/orders', () => ({ countOrders: async () => state.orders }));
vi.mock('@/lib/data/addresses', () => ({ listAddresses: async () => [] }));
vi.mock('@/lib/data/collections', () => ({ listCollections: async () => [] }));
vi.mock('@/lib/data/plus', () => ({ plusMembership: async () => state.plus }));
vi.mock('@/lib/data/balance', () => ({ storeBalance: async () => state.balance }));
vi.mock('@/lib/storefront', () => ({ viewerCart: async () => ({ count: 0 }) }));
vi.mock('@/lib/recent', () => ({ readRecentIds: async () => state.recent, historyPaused: async () => state.paused }));
vi.mock('@/app/actions/auth', () => ({ signOut: async () => {} }));

import AccountPage from './page';

const tile = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name}`) });

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.orders = 2;
  state.recent = [];
  state.paused = false;
  state.plus = null;
  state.balance = 0;
});

it('links to buy again, browsing history and help alongside the rest', async () => {
  state.recent = ['p1', 'p2'];
  render(await AccountPage());
  expect(tile('Orders')).toHaveAttribute('href', '/orders');
  expect(tile('Buy again')).toHaveAttribute('href', '/orders/buy-again');
  expect(within(tile('Buy again')).getByText('From your orders')).toBeInTheDocument();
  expect(tile('Browsing history')).toHaveAttribute('href', '/history');
  expect(within(tile('Browsing history')).getByText('On this device')).toBeInTheDocument();
  expect(tile('Customer service')).toHaveAttribute('href', '/customer-service');
});

it('says when there is nothing yet, or history is paused (India store paths)', async () => {
  state.store = amazonIn;
  state.orders = 0;
  render(await AccountPage());
  expect(tile('Buy again')).toHaveAttribute('href', '/in/orders/buy-again');
  expect(within(tile('Buy again')).getByText('Nothing to reorder yet')).toBeInTheDocument();
  expect(within(tile('Browsing history')).getByText('Nothing viewed yet')).toBeInTheDocument();
  cleanup();
  state.paused = true;
  state.recent = ['p1'];
  render(await AccountPage());
  expect(within(tile('Browsing history')).getByText('Paused')).toBeInTheDocument();
});

it('sends the signed-out to sign in', async () => {
  state.user = null;
  await expect(AccountPage()).rejects.toThrow('REDIRECT /signin?next=/account');
});

it('shows the Plus membership, joined or not', async () => {
  render(await AccountPage());
  expect(tile('Plus membership')).toHaveAttribute('href', '/prime');
  expect(within(tile('Plus membership')).getByText('Not a member')).toBeInTheDocument();
  cleanup();
  state.plus = { since: '2026-10-01T10:00:00Z' };
  render(await AccountPage());
  expect(within(tile('Plus membership')).getByText('Member · FREE delivery')).toBeInTheDocument();
});

it('shows the gift card balance in this store', async () => {
  render(await AccountPage());
  expect(tile('Gift card balance')).toHaveAttribute('href', '/gift-cards#balance');
  expect(within(tile('Gift card balance')).getByText('No balance yet')).toBeInTheDocument();
  cleanup();
  state.balance = 12550;
  render(await AccountPage());
  expect(within(tile('Gift card balance')).getByText('$125.50')).toBeInTheDocument();
});
