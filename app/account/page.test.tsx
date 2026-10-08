import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import { product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', name: 'Asha', email: 'asha@example.com' } as unknown,
  orders: 2,
  recent: [] as string[],
  paused: false,
  plus: null as { since: string } | null,
  balance: 0 as number | null,
  collections: [] as unknown[],
  toReview: [] as unknown[],
  unread: [] as string[],
  inbox: [] as { at: string }[],
  seenAt: null as string | null,
  brands: [] as unknown[],
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
vi.mock('@/lib/data/collections', async (actual) => ({
  ...(await actual<typeof import('@/lib/data/collections')>()),
  listCollections: async () => state.collections,
}));
vi.mock('@/lib/data/plus', () => ({ plusMembership: async () => state.plus }));
vi.mock('@/lib/data/reviews', () => ({ awaitingReview: async () => state.toReview }));
vi.mock('@/lib/data/balance', () => ({ storeBalance: async () => state.balance }));
vi.mock('@/lib/data/support', () => ({ unreadCaseIds: async () => new Set(state.unread) }));
vi.mock('@/lib/data/inbox', async (actual) => ({
  ...(await actual<typeof import('@/lib/data/inbox')>()),
  listInbox: async () => state.inbox,
  inboxSeenAt: async () => state.seenAt,
}));
vi.mock('@/lib/storefront', () => ({ viewerCart: async () => ({ count: 0 }) }));
vi.mock('@/lib/recent', () => ({ readRecentIds: async () => state.recent, historyPaused: async () => state.paused }));
vi.mock('@/app/actions/auth', () => ({ signOut: async () => {} }));
vi.mock('@/lib/data/brand-follows', () => ({ followedBrands: async () => state.brands }));

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
  state.collections = [];
  state.toReview = [];
  state.unread = [];
  state.inbox = [];
  state.seenAt = null;
  state.brands = [];
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

it('counts the brands followed in this store', async () => {
  render(await AccountPage());
  expect(tile('Brands you follow')).toHaveAttribute('href', '/account/brands');
  expect(within(tile('Brands you follow')).getByText('None yet')).toBeInTheDocument();
  cleanup();
  state.brands = [{ brand: 'Acme', followedAt: '2026-10-01T00:00:00Z' }, { brand: 'Bose', followedAt: '2026-09-01T00:00:00Z' }];
  render(await AccountPage());
  expect(within(tile('Brands you follow')).getByText('2 brands')).toBeInTheDocument();
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

it('counts saved items, lists, things back in stock and price drops', async () => {
  const item = (id: string, savedPriceMinor: number, savedInStock = true) => ({ product: product({ id, priceMinor: 8000 }), savedPriceMinor, savedInStock, addedAt: '2026-10-01T00:00:00Z' });
  state.collections = [
    { id: 'c', name: "Things I'm Considering", note: '', kind: 'considering', createdAt: '', items: [item('p1', 9999), item('p2', 8000)] },
    { id: 'w', name: 'Wedding', note: '', kind: 'custom', createdAt: '', items: [item('p1', 8500)] },
  ];
  render(await AccountPage());
  expect(within(tile('Collections')).getByText('3 saved items · 2 lists · 1 price drop')).toBeInTheDocument();
  cleanup();
  state.collections = [{ id: 'c', name: "Things I'm Considering", note: '', kind: 'considering', createdAt: '', items: [item('p1', 9999), item('p2', 8000, false)] }];
  render(await AccountPage());
  expect(within(tile('Collections')).getByText('2 saved items · 1 list · 1 back in stock · 1 price drop')).toBeInTheDocument();
});

it('links to your Q&A, payments and transactions', async () => {
  render(await AccountPage());
  expect(tile('Your Q&A')).toHaveAttribute('href', '/account/questions');
  expect(tile('Your Payments')).toHaveAttribute('href', '/account/payments');
  expect(tile('Your transactions')).toHaveAttribute('href', '/account/transactions');
});

it('counts what’s waiting for a review', async () => {
  render(await AccountPage());
  expect(tile('Your reviews')).toHaveAttribute('href', '/account/reviews');
  expect(within(tile('Your reviews')).getByText('All caught up')).toBeInTheDocument();
  cleanup();
  state.toReview = [{ product: product({ id: 'p1' }), orderId: 'o', deliveredAt: '2026-10-01T00:00:00Z' }, { product: product({ id: 'p2' }), orderId: 'o', deliveredAt: '2026-10-01T00:00:00Z' }];
  render(await AccountPage());
  expect(within(tile('Your reviews')).getByText('2 items to review')).toBeInTheDocument();
});

it('says when the store has replied on support cases since the shopper looked', async () => {
  render(await AccountPage());
  expect(within(tile('Your support cases')).getByText('Messages with us')).toBeInTheDocument();
  cleanup();
  state.unread = ['c1'];
  render(await AccountPage());
  expect(within(tile('Your support cases')).getByText('New reply on 1 case')).toBeInTheDocument();
  cleanup();
  state.unread = ['c1', 'c2'];
  render(await AccountPage());
  expect(within(tile('Your support cases')).getByText('New replies on 2 cases')).toBeInTheDocument();
});

it('counts messages that came in since the shopper last opened them', async () => {
  render(await AccountPage());
  expect(within(tile('Your messages')).getByText('Order and return updates')).toBeInTheDocument();
  cleanup();
  state.inbox = [{ at: '2026-10-06T09:00:00Z' }, { at: '2026-10-05T09:00:00Z' }, { at: '2026-10-01T09:00:00Z' }];
  state.seenAt = '2026-10-04T00:00:00Z';
  render(await AccountPage());
  expect(within(tile('Your messages')).getByText('2 new')).toBeInTheDocument();
  cleanup();
  state.seenAt = '2026-10-07T00:00:00Z';
  render(await AccountPage());
  expect(within(tile('Your messages')).getByText('Order and return updates')).toBeInTheDocument();
});
