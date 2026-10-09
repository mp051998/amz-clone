import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GiftCardPurchase } from '@/lib/data/gift-card-purchases';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', name: 'Sam Lee', email: 'sam@b.test' } as unknown,
  purchases: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', async (original) => ({ ...(await original<typeof import('@/lib/auth')>()), readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/origin', () => ({ siteOrigin: async () => 'https://shop.test' }));
vi.mock('@/lib/data/gift-card-purchases', async (actual) => ({
  ...(await actual<typeof import('@/lib/data/gift-card-purchases')>()),
  listGiftCardPurchases: async () => state.purchases,
}));

import PrintGiftCardPage from './page';

const codes = [
  { code: 'AAAA-111111-AAAA', redeemed: false },
  { code: 'BBBB-222222-BBBB', redeemed: true },
];

function purchase(over: Partial<GiftCardPurchase> = {}): GiftCardPurchase {
  return {
    id: 'p1', market: 'US', amountMinor: 5000, currency: 'USD', recipientName: 'Ravi', message: 'Happy birthday!', status: 'paid', quantity: 2,
    code: codes[0].code, codes, redeemed: false, reload: false, createdAt: '2026-10-05T10:00:00Z', paidAt: '2026-10-05T10:01:00Z', ...over,
  };
}

async function show(id = 'p1', sp: { code?: string } = {}) {
  render(await PrintGiftCardPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));
}

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', name: 'Sam Lee', email: 'sam@b.test' };
  state.purchases = [purchase()];
});

it('prints a card per code, with the amount, who it’s for and from, the message and where to redeem it', async () => {
  await show();
  const cards = screen.getAllByRole('article');
  expect(cards).toHaveLength(2);
  const first = within(cards[0]);
  expect(cards[0]).toHaveAccessibleName('Gift card 1 of 2');
  expect(first.getByRole('heading', { name: 'Gift card' })).toBeInTheDocument();
  expect(first.getByText('$50')).toBeInTheDocument();
  expect(first.getByText('Ravi')).toBeInTheDocument();
  expect(first.getByText('Sam')).toBeInTheDocument();
  expect(first.getByText('“Happy birthday!”')).toBeInTheDocument();
  expect(first.getByText('AAAA-111111-AAAA')).toBeInTheDocument();
  expect(first.getByText('https://shop.test/gift-cards')).toBeInTheDocument();
  expect(first.queryByText(/already been redeemed/)).toBeNull();
  // a redeemed one says so
  expect(within(cards[1]).getByText('This code has already been redeemed.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Print 2 gift cards' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← Back to gift cards' })).toHaveAttribute('href', '/gift-cards#purchases');
});

it('?code= prints just that card; an unknown one prints them all', async () => {
  await show('p1', { code: 'AAAA-111111-AAAA' });
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByRole('article')).toHaveAccessibleName('Gift card');
  expect(screen.getByRole('button', { name: 'Print gift card' })).toBeInTheDocument();
  cleanup();
  await show('p1', { code: 'ZZZZ-000000-ZZZZ' });
  expect(screen.getAllByRole('article')).toHaveLength(2);
});

it('leaves out who it’s for and the message when there are none, in the store’s money', async () => {
  state.store = amazonIn;
  state.purchases = [purchase({ market: 'IN', currency: 'INR', amountMinor: 100_000, recipientName: null, message: null, quantity: 1, codes: [codes[0]] })];
  await show();
  expect(screen.getByText('₹1,000')).toBeInTheDocument();
  expect(screen.queryByText('To')).toBeNull();
  expect(screen.getByText('https://shop.test/in/gift-cards')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← Back to gift cards' })).toHaveAttribute('href', '/in/gift-cards#purchases');
});

it('signed out, signs in first and comes back', async () => {
  state.user = null;
  await expect(show('p1', { code: 'AAAA-111111-AAAA' })).rejects.toThrow(
    `REDIRECT /signin?next=${encodeURIComponent('/gift-cards/p1/print?code=AAAA-111111-AAAA')}`,
  );
});

it('someone else’s purchase, an unpaid one or a reload has nothing to print', async () => {
  await expect(show('p9')).rejects.toThrow('NOT_FOUND');
  state.purchases = [purchase({ status: 'awaiting_payment', code: null, codes: [] })];
  await expect(show()).rejects.toThrow('NOT_FOUND');
  state.purchases = [purchase({ reload: true, recipientName: null, message: null, code: null, codes: [] })];
  await expect(show()).rejects.toThrow('NOT_FOUND');
});
