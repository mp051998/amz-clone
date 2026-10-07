import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { SalesReport } from '@/lib/data/admin-sales';

const state = vi.hoisted(() => ({ store: null as unknown, admin: true, report: null as unknown, calls: [] as unknown[] }));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('../guard', () => ({ adminPage: async () => ({ store: state.store, user: { id: 'a1' }, admin: state.admin }) }));
vi.mock('@/lib/data/admin-sales', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/data/admin-sales')>()),
  adminSales: async (_db: unknown, market: unknown, days: unknown) => {
    state.calls.push([market, days]);
    return state.report;
  },
}));

import AdminSalesPage from './page';

const report = (over: Partial<SalesReport> = {}): SalesReport => ({
  days: 7,
  from: '2026-10-01',
  to: '2026-10-07',
  timeZone: 'Asia/Kolkata',
  totals: { orders: 4, units: 9, salesMinor: 1_000_000, cancelledOrders: 1, returns: 1, unitsReturned: 2, refundedMinor: 150_000 },
  byDay: ['01', '02', '03', '04', '05', '06', '07'].map((d, i) => ({ day: `2026-10-${d}`, orders: i === 6 ? 4 : 0, units: i === 6 ? 9 : 0, salesMinor: i === 6 ? 1_000_000 : 0 })),
  top: [
    { productId: 'kettle', title: 'Electric Kettle', image: '/k.jpg', orders: 3, units: 6, salesMinor: 600_000 },
    { productId: 'mug', title: 'Mug', image: '', orders: 1, units: 1, salesMinor: 40_000 },
  ],
  ...over,
});

beforeEach(() => {
  state.store = amazon;
  state.admin = true;
  state.report = report();
  state.calls = [];
});
afterEach(cleanup);

it('totals the period, day by day, with the best sellers', async () => {
  state.store = amazonIn;
  render(await AdminSalesPage({ searchParams: Promise.resolve({ days: '7' }) }));
  expect(state.calls).toEqual([['IN', 7]]);

  const tabs = within(screen.getByRole('navigation', { name: 'Sales period' }));
  expect(tabs.getByRole('link', { name: 'Last 30 days' })).toHaveAttribute('href', '/in/admin/sales');
  expect(tabs.getByRole('link', { name: 'Last 90 days' })).toHaveAttribute('href', '/in/admin/sales?days=90');

  const totals = within(screen.getByRole('list', { name: 'Totals' }));
  expect(totals.getByText('Ordered product sales').parentElement).toHaveTextContent('₹10,000');
  expect(totals.getByText('Orders').parentElement).toHaveTextContent('4Average order ₹2,500.');
  expect(totals.getByText('Units ordered').parentElement).toHaveTextContent('2.3 per order.');
  expect(totals.getByText('Returns received').parentElement).toHaveTextContent('2 units back, ₹1,500 refunded.');

  const rows = within(screen.getByRole('table')).getAllByRole('row');
  // header, then newest day first
  expect(rows).toHaveLength(8);
  expect(rows[1]).toHaveTextContent('7 Oct49₹10,000');

  const best = within(screen.getByRole('heading', { name: 'Best sellers' }).parentElement!).getAllByRole('listitem');
  expect(within(best[0]).getByRole('link', { name: 'Electric Kettle' })).toHaveAttribute('href', '/in/product/kettle');
  expect(best[0]).toHaveTextContent('6 units · 3 orders');
  expect(best[1]).toHaveTextContent('1 unit · 1 order');
});

it('defaults to 30 days and says when nothing sold', async () => {
  state.report = report({ days: 30, totals: { orders: 0, units: 0, salesMinor: 0, cancelledOrders: 0, returns: 0, unitsReturned: 0, refundedMinor: 0 }, top: [] });
  render(await AdminSalesPage({ searchParams: Promise.resolve({ days: 'all' }) }));
  expect(state.calls).toEqual([['US', 30]]);
  expect(within(screen.getByRole('navigation', { name: 'Sales period' })).getByRole('link', { name: 'Last 30 days' })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByText('No orders in these days yet.')).toBeInTheDocument();
  expect(screen.getByText('Nothing ordered yet.')).toBeInTheDocument();
});

it('is for admins only', async () => {
  state.admin = false;
  render(await AdminSalesPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('This area is for store admins.')).toBeInTheDocument();
  expect(state.calls).toEqual([]);
});
