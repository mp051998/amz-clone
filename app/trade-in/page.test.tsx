import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { ExchangeDevice } from '@/lib/exchange';
import type { TradeIn } from '@/lib/data/trade-ins';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  devices: [] as unknown[],
  tradeIns: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/app/actions/trade-in', () => ({ requestTradeInAction: async () => {}, cancelTradeInAction: async () => {} }));
vi.mock('@/lib/data/exchange', () => ({ listExchangeDevices: async () => state.devices }));
vi.mock('@/lib/data/trade-ins', () => ({ listTradeIns: async () => state.tradeIns }));

import TradeInPage from './page';

const page = async (sp: Record<string, string> = {}) => render(await TradeInPage({ searchParams: Promise.resolve(sp) }));
const sam = { id: 'u1', name: 'Sam', email: 'sam@example.com' };

const DEVICES: ExchangeDevice[] = [
  { id: 'us-apple-iphone-14', kind: 'phone', brand: 'Apple', model: 'iPhone 14', valueMinor: 25_000 },
  { id: 'us-dell-xps-13', kind: 'laptop', brand: 'Dell', model: 'XPS 13 (9315)', valueMinor: 28_000 },
];

const tradeIn = (over: Partial<TradeIn> = {}): TradeIn => ({
  id: 't1', deviceId: 'us-apple-iphone-14', device: 'Apple iPhone 14', kind: 'phone', condition: 'good', quoteMinor: 25_000,
  goodMinor: 25_000, status: 'open', shipCode: 'AB12-CD34', shipBy: '2026-10-15T16:00:00Z', createdAt: '2026-10-08T16:00:00Z', ...over,
});

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = sam;
  state.devices = DEVICES;
  state.tradeIns = [];
});

it('is amazon.com’s only', async () => {
  state.store = amazonIn;
  await expect(page()).rejects.toThrow('NOT_FOUND');
});

it('lists the models by kind with what each is worth, and the best value up top', async () => {
  await page();
  expect(screen.getByRole('heading', { name: 'Trade in your old phone or laptop' })).toBeInTheDocument();
  expect(screen.getByText(/up to \$280\.00 as gift card credit/)).toBeInTheDocument();
  const model = screen.getByLabelText('Model');
  expect(within(model).getByRole('group', { name: 'Phones' })).toHaveTextContent('Apple iPhone 14 — up to $250.00');
  expect(within(model).getByRole('group', { name: 'Laptops' })).toHaveTextContent('Dell XPS 13 (9315) — up to $280.00');
  expect(screen.getByRole('radio', { name: /screen undamaged/ })).toBeChecked();
  expect(screen.queryByRole('button', { name: /Trade in for/ })).toBeNull();
});

it('quotes a model in a condition, half with a damaged screen', async () => {
  await page({ device: 'us-apple-iphone-14', condition: 'screen_damaged' });
  expect(screen.getByText('$125.00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Trade in for $125.00' })).toBeInTheDocument();
  expect(screen.getByLabelText('Model')).toHaveValue('us-apple-iphone-14');
  expect(screen.getByRole('radio', { name: /screen cracked/ })).toBeChecked();
});

it('asks a signed-out shopper to sign in with the quote kept', async () => {
  state.user = null;
  await page({ device: 'us-dell-xps-13', condition: 'good' });
  const link = screen.getByRole('link', { name: 'Sign in to trade in' });
  expect(link.getAttribute('href')).toContain(encodeURIComponent('/trade-in?device=us-dell-xps-13&condition=good#quote'));
  expect(screen.queryByRole('button', { name: /Trade in for/ })).toBeNull();
});

it('says what’s wrong with the quote form', async () => {
  await page({ device: 'nope', condition: 'good' });
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a model from the list.');
  cleanup();
  await page({ device: 'us-apple-iphone-14', condition: 'good', error: 'limit' });
  expect(screen.getByText(/5 trade-ins waiting to be sent/)).toBeInTheDocument();
});

it('confirms a trade-in with its label code and send-by day', async () => {
  state.tradeIns = [tradeIn()];
  await page({ done: 't1' });
  expect(screen.getByText(/Your Apple iPhone 14 is traded in for \$250\.00\. Send it by October 15 with label code AB12-CD34/)).toBeInTheDocument();
});

it('shows the shopper’s trade-ins by where they are, with cancel on open ones', async () => {
  state.tradeIns = [
    tradeIn(),
    tradeIn({ id: 't2', status: 'credited', receivedCondition: 'screen_damaged', creditedMinor: 12_500, closedAt: '2026-10-07T16:00:00Z' }),
    tradeIn({ id: 't3', status: 'rejected', rejectNote: 'It didn’t switch on', closedAt: '2026-10-06T16:00:00Z' }),
  ];
  await page();
  const items = within(screen.getByRole('heading', { name: 'Your trade-ins' }).closest('section')!).getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent('Waiting for your device');
  expect(items[0]).toHaveTextContent('AB12-CD34');
  expect(within(items[0]).getByRole('button', { name: 'Cancel trade-in' })).toBeInTheDocument();
  expect(items[1]).toHaveTextContent('Credited to your balance$125.00');
  expect(items[1]).toHaveTextContent('We found');
  expect(within(items[1]).queryByRole('button')).toBeNull();
  expect(items[2]).toHaveTextContent('Sent back');
  expect(items[2]).toHaveTextContent('It didn’t switch on');
});
