import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { AdminOverview } from '@/lib/data/admin-overview';

const state = vi.hoisted(() => ({ store: null as unknown, admin: true, overview: null as unknown, markets: [] as unknown[] }));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('./guard', () => ({ adminPage: async () => ({ store: state.store, user: { id: 'a1' }, admin: state.admin }) }));
vi.mock('@/lib/data/admin-overview', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/data/admin-overview')>()),
  adminOverview: async (_db: unknown, market: unknown) => {
    state.markets.push(market);
    return state.overview;
  },
}));

import AdminHome from './page';

const quiet = (): AdminOverview => ({
  orders: { toShip: 0, inTransit: 0, refundIssues: 0 },
  returns: { open: 0, refundIssues: 0 },
  reportedReviews: 0,
  unansweredQuestions: 0,
  productReports: 0,
  support: { waiting: 0, oldestWaiting: null },
  stock: { out: 0, low: 0 },
});

const tile = (label: string) => screen.getByRole('link', { name: new RegExp(`^${label}: `) });

beforeEach(() => {
  state.store = amazon;
  state.admin = true;
  state.overview = quiet();
  state.markets = [];
});
afterEach(cleanup);

it('counts each queue and links to it in this store', async () => {
  state.store = amazonIn;
  state.overview = {
    orders: { toShip: 4, inTransit: 1200, refundIssues: 1 },
    returns: { open: 2, refundIssues: 0 },
    reportedReviews: 3,
    unansweredQuestions: 0,
    productReports: 5,
    support: { waiting: 2, oldestWaiting: '2026-10-01T09:00:00Z' },
    stock: { out: 6, low: 8 },
  } satisfies AdminOverview;
  render(await AdminHome());

  expect(state.markets).toEqual(['IN']);
  expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy();
  expect(screen.getByText('17 things need doing in this store.')).toBeTruthy();

  const expected: [string, string, string][] = [
    ['Orders to ship', '4', '/in/admin/orders?filter=preparing'],
    ['Order refund problems', '1', '/in/admin/orders?filter=refund_issues'],
    ['Returns to process', '2', '/in/admin/returns'],
    ['Return refund problems', '0', '/in/admin/returns?filter=refund_issues'],
    ['In transit', '1,200', '/in/admin/orders?filter=shipped'],
    ['Support cases waiting', '2', '/in/admin/support'],
    ['Reported reviews', '3', '/in/admin/reviews'],
    ['Unanswered questions', '0', '/in/admin/questions'],
    ['Product reports', '5', '/in/admin/product-reports'],
    ['Out of stock', '6', '/in/admin/products?stock=out'],
    ['Low stock', '8', '/in/admin/products?stock=low'],
  ];
  for (const [label, count, href] of expected) {
    const link = tile(label);
    expect(link.getAttribute('aria-label')).toBe(`${label}: ${count}`);
    expect(link.getAttribute('href')).toBe(href);
  }

  expect(within(tile('Support cases waiting')).getByText(/^Longest waiting since /)).toBeTruthy();
  expect(within(tile('Return refund problems')).getByText('All clear.')).toBeTruthy();
  expect(within(tile('Unanswered questions')).getByText('All clear.')).toBeTruthy();
  expect(tile('Order refund problems').className).toContain('border-bad');
  expect(tile('Return refund problems').className).not.toContain('border-bad');
});

it('says when nothing is waiting, and keeps the note on information-only tiles', async () => {
  render(await AdminHome());
  expect(screen.getByText('Nothing is waiting on you in this store.')).toBeTruthy();
  expect(within(tile('In transit')).getByText('Shipped, not delivered yet.')).toBeTruthy();
  expect(within(tile('Orders to ship')).getByText('All clear.')).toBeTruthy();
  expect(tile('Orders to ship').getAttribute('href')).toBe('/admin/orders?filter=preparing');
});

it('uses the singular for one thing', async () => {
  state.overview = { ...quiet(), reportedReviews: 1 };
  render(await AdminHome());
  expect(screen.getByText('1 thing needs doing in this store.')).toBeTruthy();
});

it('shows "admins only" to a signed-in non-admin without reading the queues', async () => {
  state.admin = false;
  render(await AdminHome());
  expect(screen.getByText('This area is for store admins.')).toBeTruthy();
  expect(state.markets).toEqual([]);
});
