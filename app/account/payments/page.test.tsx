import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { SavedCard } from '@/lib/data/wallet';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  cards: [] as SavedCard[] | Error,
  added: null as SavedCard | null,
  balance: 0 as number | null,
  stripe: true,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/balance', () => ({ storeBalance: async () => state.balance }));
vi.mock('@/lib/data/wallet', async () => {
  const { DataError } = await import('@/lib/data/errors');
  return {
    cardLabel: (c: SavedCard) => `${c.brand} ending ${c.last4}`,
    listSavedCards: async () => {
      if (state.cards instanceof Error) throw new DataError('payments_unavailable');
      return state.cards;
    },
    addedCard: async (_user: string, id: string) => (id === 'cs_test_ok' ? state.added : null),
  };
});
vi.mock('@/lib/stripe', () => ({
  get stripeConfigured() {
    return state.stripe;
  },
}));
vi.mock('@/app/actions/wallet', () => ({ addCardAction: async () => {}, removeCardAction: async () => {} }));

import PaymentsPage from './page';

const page = async (sp: Record<string, string> = {}) => render(await PaymentsPage({ searchParams: Promise.resolve(sp) }));
const card = (over: Partial<SavedCard> = {}): SavedCard => ({ id: 'pm_1', brand: 'Visa', last4: '4242', expMonth: 4, expYear: 2029, expired: false, ...over });

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.cards = [];
  state.added = null;
  state.balance = 0;
  state.stripe = true;
});

it('signed out, starts with signing in', async () => {
  state.user = null;
  await expect(page()).rejects.toThrow('REDIRECT /signin?next=/account/payments');
});

it('lists saved cards with their expiry, each with Remove, and adds another', async () => {
  state.cards = [card(), card({ id: 'pm_2', brand: 'Mastercard', last4: '4444', expMonth: 9, expYear: 2025, expired: true })];
  state.balance = 1250;
  await page();
  const list = screen.getByRole('list');
  expect(within(list).getByText('Visa ending 4242')).toBeInTheDocument();
  expect(within(list).getByText('Expires 04/2029')).toBeInTheDocument();
  expect(within(list).getByText('Expired 09/2025')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove Mastercard ending 4444' })).toBeInTheDocument();
  expect(document.querySelector('input[name="id"][value="pm_2"]')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Add a card' })).toBeInTheDocument();
  expect(screen.getByText('$12.50')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Reload your balance' })).toHaveAttribute('href', '/gift-cards#reload');
});

it('with no cards, says how to save one', async () => {
  await page();
  expect(screen.getByText('No saved cards')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add a card' })).toBeInTheDocument();
});

it('back from Stripe: the card just added, a removal, a cancel or an error', async () => {
  state.added = card({ id: 'pm_9', last4: '1881' });
  await page({ added: 'cs_test_ok' });
  expect(screen.getByText(/Visa ending 1881 is saved/)).toBeInTheDocument();
  cleanup();
  await page({ added: 'cs_test_forged' });
  expect(screen.queryByText(/is saved/)).toBeNull();
  cleanup();
  await page({ removed: '1' });
  expect(screen.getByText('Card removed.')).toBeInTheDocument();
  cleanup();
  await page({ canceled: '1' });
  expect(screen.getByText('No card was added.')).toBeInTheDocument();
  cleanup();
  await page({ error: 'card_not_found' });
  expect(screen.getByText('That card isn’t saved to your account.')).toBeInTheDocument();
});

it('when Stripe can’t list the cards, says so', async () => {
  state.cards = new Error('down');
  await page();
  expect(screen.getByText(/can’t be shown right now/)).toBeInTheDocument();
});

it('without card payments, there are no cards to save (India store)', async () => {
  state.store = amazonIn;
  state.stripe = false;
  await page();
  expect(screen.getByText('Card payments aren’t set up here')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add a card' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Add money' })).toBeNull();
});
