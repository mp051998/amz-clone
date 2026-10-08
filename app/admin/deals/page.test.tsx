import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import type { AdminDealList, AdminLightningDeal } from '@/lib/data/admin-lightning-deals';

const state = vi.hoisted(() => ({ admin: true, list: null as unknown, calls: [] as unknown[] }));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('../actions', () => ({ cancelDealAction: async () => undefined }));
vi.mock('../guard', async () => ({ adminPage: async () => ({ store: (await import('@/lib/amazon')).amazon, user: { id: 'a1' }, admin: state.admin }) }));
vi.mock('@/lib/data/admin-lightning-deals', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/data/admin-lightning-deals')>()),
  listAdminLightningDeals: async (_db: unknown, market: unknown, view: unknown) => {
    state.calls.push([market, view]);
    return state.list;
  },
}));

import AdminDealsPage from './page';

const deal = (over: Partial<AdminLightningDeal> = {}): AdminLightningDeal => ({
  id: 'd1',
  productId: 'lamp',
  title: 'Desk Lamp',
  image: '/lamp.jpg',
  dealPriceMinor: 3500,
  wasPriceMinor: 5000,
  quota: 20,
  claimed: 5,
  startsAt: '2026-10-08T16:00:00.000Z',
  endsAt: '2026-10-08T22:00:00.000Z',
  startedAt: '2026-10-08T16:00:00.000Z',
  endedAt: null,
  endReason: null,
  byAdmin: false,
  ...over,
});

const list = (over: Partial<AdminDealList> = {}): AdminDealList => ({ view: 'live', deals: [deal()], counts: { live: 1, upcoming: 3 }, ...over });

beforeEach(() => {
  state.admin = true;
  state.list = list();
  state.calls = [];
});
afterEach(cleanup);

const sp = (v: Record<string, string> = {}) => ({ searchParams: Promise.resolve(v) });

it('lists live deals with their price, claims and end, each to end now', async () => {
  render(await AdminDealsPage(sp()));
  expect(state.calls).toEqual([['US', 'live']]);
  const tabs = within(screen.getByRole('navigation', { name: 'Deals' }));
  expect(tabs.getByRole('link', { name: 'Live (1)' })).toHaveAttribute('aria-current', 'true');
  expect(tabs.getByRole('link', { name: 'Upcoming (3)' })).toHaveAttribute('href', '/admin/deals?view=upcoming');

  const row = within(screen.getByRole('list', { name: 'Live deals' })).getByRole('listitem');
  expect(within(row).getByRole('link', { name: 'Desk Lamp' })).toHaveAttribute('href', '/admin/products/lamp#lightning-deal');
  expect(row).toHaveTextContent('$35.00 $50.00 · 30% off');
  expect(row).toHaveTextContent('Ends Oct 8, 3:00 PM · Planned by the store');
  expect(row).toHaveTextContent('5 of 20 claimed');
  expect(within(row).getByRole('button', { name: 'End now' })).toBeInTheDocument();
});

it('shows upcoming ones to cancel, and ended ones with why', async () => {
  state.list = list({ view: 'upcoming', deals: [deal({ startedAt: null, byAdmin: true, endsAt: '2026-10-08T18:00:00.000Z' })] });
  render(await AdminDealsPage(sp({ view: 'upcoming' })));
  let row = within(screen.getByRole('list', { name: 'Upcoming deals' })).getByRole('listitem');
  expect(row).toHaveTextContent('Starts Oct 8, 9:00 AM · 2 hours · Scheduled by an admin');
  expect(row).toHaveTextContent('20 units');
  expect(within(row).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  cleanup();

  state.list = list({ view: 'ended', deals: [deal({ claimed: 20, endedAt: '2026-10-08T19:00:00.000Z', endReason: 'sold_out' })] });
  render(await AdminDealsPage(sp({ view: 'ended', done: 'deal_cancelled' })));
  row = within(screen.getByRole('list', { name: 'Ended deals' })).getByRole('listitem');
  expect(row).toHaveTextContent('Sold out · Oct 8, 12:00 PM');
  expect(row).toHaveTextContent('20 of 20 claimed');
  expect(within(row).queryByRole('button')).toBeNull();
  expect(screen.getByText(/Deal cancelled/)).toBeInTheDocument();
});

it('says when there are none, and keeps non-admins out', async () => {
  state.list = list({ deals: [], counts: { live: 0, upcoming: 0 } });
  render(await AdminDealsPage(sp()));
  expect(screen.getByText('No Lightning Deals are live right now.')).toBeInTheDocument();
  cleanup();

  state.admin = false;
  render(await AdminDealsPage(sp()));
  expect(screen.getByText('This area is for store admins.')).toBeInTheDocument();
});
