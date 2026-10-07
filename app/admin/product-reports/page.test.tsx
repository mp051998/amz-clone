import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { ProductReportQueuePage } from '@/lib/data/product-reports';

const state = vi.hoisted(() => ({ store: null as unknown, admin: true, page: null as unknown, asked: [] as unknown[] }));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('../guard', () => ({ adminPage: async () => ({ store: state.store, user: { id: 'a1' }, admin: state.admin }) }));
vi.mock('./actions', () => ({ resolveReportAction: async () => {} }));
vi.mock('@/lib/data/product-reports', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/data/product-reports')>()),
  listProductReportQueue: async (_db: unknown, market: unknown, opts: unknown) => {
    state.asked.push([market, opts]);
    return state.page;
  },
}));

import AdminProductReportsPage from './page';

const report = (over: Partial<ProductReportQueuePage['reports'][number]> = {}): ProductReportQueuePage['reports'][number] => ({
  id: 'r1', productId: 'k 1', reason: 'wrong_info', details: 'Says 2 batteries, box had none', status: 'open',
  createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z', resolvedAt: null, resolutionNote: null,
  reporter: 'Asha', productTitle: 'Kettle', productArchived: false, ...over,
});
const pageOf = (reports: ProductReportQueuePage['reports'], counts = { open: 1, closed: 0, all: 1 }): ProductReportQueuePage => ({ reports, total: reports.length, page: 1, pageSize: 25, counts });
const show = async (sp: Record<string, string> = {}) => render(await AdminProductReportsPage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  state.store = amazon;
  state.admin = true;
  state.page = pageOf([report()]);
  state.asked = [];
});
afterEach(cleanup);

it('lists open reports with the product, reason, details and the ways to close them', async () => {
  await show();
  expect(state.asked).toEqual([['US', { view: 'open', page: 1 }]]);
  expect(screen.getByRole('link', { name: 'Open (1)' })).toHaveAttribute('href', '/admin/product-reports');
  expect(screen.getByRole('link', { name: 'Closed (0)' })).toHaveAttribute('href', '/admin/product-reports?view=closed');
  const card = screen.getByRole('article', { name: 'Product details are wrong or missing' });
  expect(within(card).getByRole('link', { name: 'Kettle' })).toHaveAttribute('href', '/product/k%201');
  expect(within(card).getByText('Says 2 batteries, box had none')).toBeInTheDocument();
  expect(within(card).getByText('Asha')).toBeInTheDocument();
  expect(within(card).getByRole('link', { name: 'Edit listing' })).toHaveAttribute('href', '/admin/products/k%201');
  expect(within(card).getByRole('button', { name: 'Resolve' })).toHaveAttribute('value', 'resolved');
  expect(within(card).getByRole('button', { name: 'Dismiss' })).toHaveAttribute('value', 'dismissed');
  expect(within(card).getByLabelText(/Note/)).toHaveAttribute('name', 'note');
});

it('closed reports show the outcome and note, with no actions; India store paths', async () => {
  state.store = amazonIn;
  state.page = pageOf([report({ status: 'resolved', resolvedAt: '2026-10-03T09:00:00Z', resolutionNote: 'Fixed the bullets', productArchived: true })], { open: 0, closed: 1, all: 1 });
  await show({ view: 'closed', done: 'resolved' });
  expect(state.asked).toEqual([['IN', { view: 'closed', page: 1 }]]);
  expect(screen.getByText('Report resolved.')).toBeInTheDocument();
  const card = screen.getByRole('article');
  expect(within(card).getByText('Fixed the bullets')).toBeInTheDocument();
  expect(within(card).getByText('Kettle (archived)')).toBeInTheDocument();
  expect(within(card).queryByRole('button')).toBeNull();
  expect(screen.getByRole('link', { name: 'All (1)' })).toHaveAttribute('href', '/in/admin/product-reports?view=all');
});

it('says when nothing is open, shows errors, and keeps non-admins out', async () => {
  state.page = pageOf([], { open: 0, closed: 0, all: 0 });
  await show({ error: 'report_closed' });
  expect(screen.getByText('No open reports.')).toBeInTheDocument();
  expect(screen.getByText('That report has already been resolved or dismissed.')).toBeInTheDocument();
  cleanup();
  state.admin = false;
  await show();
  expect(screen.getByText('This area is for store admins.')).toBeInTheDocument();
});
