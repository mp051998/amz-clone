import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { BalanceEntry, GiftCard } from '@/lib/data/balance';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  balance: null as number | null,
  history: [] as BalanceEntry[],
  demo: null as GiftCard | null,
  demoAmount: null as number | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/balance', () => ({
  storeBalance: async () => state.balance,
  balanceHistory: async () => state.history,
  demoGiftCard: async () => state.demo,
  demoGiftCardAmount: async () => state.demoAmount,
}));
vi.mock('@/app/actions/gift-cards', () => ({ redeemGiftCardAction: async () => ({}), claimDemoGiftCardAction: async () => {} }));

import GiftCardsPage from './page';

const page = async (sp: { claimed?: string } = {}) => render(await GiftCardsPage({ searchParams: Promise.resolve(sp) }));
const asha = { id: 'u1', name: 'Asha', email: 'asha@example.com' };

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = null;
  state.balance = null;
  state.history = [];
  state.demo = null;
  state.demoAmount = null;
});

it('signed out, redeeming starts with signing in', async () => {
  await page();
  expect(screen.getByRole('link', { name: 'Sign in to redeem' })).toHaveAttribute('href', '/signin?next=/gift-cards');
  expect(screen.queryByLabelText('Gift card code')).toBeNull();
});

it('a new shopper sees an empty balance and can get a demo card', async () => {
  state.user = asha;
  state.balance = 0;
  state.demoAmount = 10000;
  await page();
  expect(screen.getByText('$0.00')).toBeInTheDocument();
  expect(screen.getByLabelText('Gift card code')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Get a $100.00 demo gift card' })).toBeInTheDocument();
  expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
});

it('a claimed card is ready to redeem, prefilled', async () => {
  state.user = asha;
  state.balance = 0;
  state.demoAmount = 10000;
  state.demo = { code: 'A1B2-C3D4E5-F6A7', amountMinor: 10000, redeemed: false };
  await page({ claimed: '1' });
  expect(screen.getByRole('status')).toHaveTextContent('Your demo gift card is ready: A1B2-C3D4E5-F6A7');
  expect(screen.getByLabelText('Gift card code')).toHaveValue('A1B2-C3D4E5-F6A7');
  expect(screen.queryByRole('button', { name: /demo gift card/ })).toBeNull();
  expect(screen.getByText(/is waiting to be redeemed/)).toBeInTheDocument();
});

it('shows the balance and its activity (India store)', async () => {
  state.store = amazonIn;
  state.user = asha;
  state.balance = 412_000;
  state.demoAmount = 500_000;
  state.demo = { code: 'A1B2-C3D4E5-F6A7', amountMinor: 500_000, redeemed: true };
  state.history = [
    { id: 2, amountMinor: -88_000, kind: 'order', orderId: '402-1234567-1234567', giftCardCode: null, at: '2026-10-05T10:00:00Z' },
    { id: 1, amountMinor: 500_000, kind: 'gift_card', orderId: null, giftCardCode: 'A1B2-C3D4E5-F6A7', at: '2026-10-04T10:00:00Z' },
  ];
  await page();
  expect(screen.getByText('₹4,120')).toBeInTheDocument();
  expect(screen.getByText('Order 402-1234567-1234567')).toBeInTheDocument();
  expect(screen.getByText('−₹880')).toBeInTheDocument();
  expect(screen.getByText('+₹5,000')).toBeInTheDocument();
  expect(screen.getByText(/has been redeemed/)).toBeInTheDocument();
  expect(screen.getByText(/Wallet balance/)).toBeInTheDocument();
});

it('signed in, an unreadable balance says so instead of asking to sign in', async () => {
  state.user = asha;
  await page();
  expect(screen.getByText(/can’t be shown right now/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sign in to redeem' })).toBeNull();
});
