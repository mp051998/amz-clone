import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { PriceReportQueue } from '@/lib/data/lower-price';
import type { PriceReport } from '@/lib/lower-price';

const state = vi.hoisted(() => ({ store: null as unknown, admin: true, queue: null as unknown, asked: [] as unknown[] }));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('../../guard', () => ({ adminPage: async () => ({ store: state.store, user: { id: 'a1' }, admin: state.admin }) }));
vi.mock('./actions', () => ({ reviewPricesAction: async () => {} }));
vi.mock('@/lib/data/lower-price', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/data/lower-price')>()),
  listPriceReportQueue: async (_db: unknown, market: unknown, opts: unknown) => {
    state.asked.push([market, opts]);
    return state.queue;
  },
}));

import AdminLowerPricesPage from './page';

const report = (over: Partial<PriceReport> = {}): PriceReport => ({
  id: 'r1', productId: 'k 1', ourPriceMinor: 9999, seenAt: 'online', url: 'https://www.example.com/kettle', storeName: null, city: null, seenOn: null,
  priceMinor: 7999, shippingMinor: 500, status: 'open', createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z', reviewedAt: null, ...over,
});
const queue = (over: Partial<PriceReportQueue> = {}): PriceReportQueue => ({
  products: [
    {
      productId: 'k 1', title: 'Kettle', archived: false, priceMinor: 9999, lowestMinor: 7500,
      reports: [
        report({ id: 'r2', seenAt: 'store', url: null, storeName: 'Best Buy', city: 'Austin', seenOn: '2026-10-06', priceMinor: 7500, shippingMinor: 0 }),
        report(),
      ],
    },
  ],
  counts: { open: 2, reviewed: 1 },
  ...over,
});
const show = async (sp: Record<string, string> = {}) => render(await AdminLowerPricesPage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  state.store = amazon;
  state.admin = true;
  state.queue = queue();
  state.asked = [];
});
afterEach(cleanup);

it('lists each product’s reports with the lowest against the price now, and marks them reviewed', async () => {
  await show();
  expect(state.asked).toEqual([['US', { view: 'open' }]]);
  expect(screen.getByRole('link', { name: 'To review (2)' })).toHaveAttribute('href', '/admin/product-reports/lower-prices');
  expect(screen.getByRole('link', { name: 'Reviewed (1)' })).toHaveAttribute('href', '/admin/product-reports/lower-prices?view=reviewed');
  expect(screen.getByRole('link', { name: 'Product reports' })).toHaveAttribute('href', '/admin/product-reports');

  const card = screen.getByRole('article', { name: 'Kettle' });
  expect(within(card).getByRole('link', { name: 'Kettle' })).toHaveAttribute('href', '/product/k%201');
  expect(within(card).getByText('Our price $99.99 · lowest reported $75.00 ($24.99 less)')).toBeInTheDocument();
  expect(within(card).getByText('2 reports')).toBeInTheDocument();
  const rows = within(card).getAllByRole('row').slice(1);
  expect(within(rows[0]).getByText('Best Buy, Austin')).toBeInTheDocument();
  expect(within(rows[0]).getByText('Oct 6')).toBeInTheDocument();
  const site = within(rows[1]).getByRole('link', { name: 'example.com' });
  expect(site).toHaveAttribute('href', 'https://www.example.com/kettle');
  expect(site).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  expect(within(rows[1]).getByText('$84.99')).toBeInTheDocument();
  expect(within(rows[1]).getByText('incl. $5.00 delivery')).toBeInTheDocument();
  expect(within(card).getByRole('link', { name: 'Edit listing' })).toHaveAttribute('href', '/admin/products/k%201');
  expect(within(card).getByRole('button', { name: 'Mark reviewed' })).toBeInTheDocument();
});

it('says when a report isn’t lower any more, and has nothing to do once reviewed', async () => {
  state.store = amazonIn;
  state.queue = queue({ products: [{ productId: 'in-1', title: 'Mixer', archived: true, priceMinor: 199_900, lowestMinor: 249_900, reports: [report({ ourPriceMinor: 299_900, priceMinor: 249_900, shippingMinor: 0, url: 'https://shop.example.in/m' })] }] });
  await show({ view: 'reviewed' });
  expect(state.asked).toEqual([['IN', { view: 'reviewed' }]]);
  const card = screen.getByRole('article', { name: 'Mixer (archived)' });
  expect(within(card).getByText(/\(not lower now\)/)).toBeInTheDocument();
  expect(within(card).getByText('ours then ₹2,999')).toBeInTheDocument();
  expect(within(card).queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
  expect(within(card).queryByRole('link', { name: 'Edit listing' })).toBeNull();
});

it('says when there is nothing to review, and what happened', async () => {
  state.queue = queue({ products: [], counts: { open: 0, reviewed: 3 } });
  await show({ done: 'reviewed' });
  expect(screen.getByText('Nothing to review.')).toBeInTheDocument();
  expect(screen.getByText('Marked reviewed.')).toBeInTheDocument();
  cleanup();
  await show({ error: 'forbidden' });
  expect(screen.queryByText('Marked reviewed.')).toBeNull();
});

it('is for admins only', async () => {
  state.admin = false;
  await show();
  expect(screen.getByText('This area is for store admins.')).toBeInTheDocument();
  expect(state.asked).toEqual([]);
});
