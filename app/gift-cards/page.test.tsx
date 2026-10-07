import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { BalanceEntry, GiftCard } from '@/lib/data/balance';
import type { GiftCardPurchase } from '@/lib/data/gift-card-purchases';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  balance: null as number | null,
  history: [] as BalanceEntry[],
  demo: null as GiftCard | null,
  demoAmount: null as number | null,
  purchases: [] as GiftCardPurchase[],
  stripe: true,
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
vi.mock('@/lib/data/gift-card-purchases', async (actual) => ({
  ...(await actual<typeof import('@/lib/data/gift-card-purchases')>()),
  listGiftCardPurchases: async () => state.purchases,
}));
vi.mock('@/lib/stripe', () => ({
  get stripeConfigured() {
    return state.stripe;
  },
}));
vi.mock('@/app/actions/gift-cards', () => ({ redeemGiftCardAction: async () => ({}), claimDemoGiftCardAction: async () => {}, buyGiftCardAction: async () => ({}), reloadBalanceAction: async () => ({}) }));

import GiftCardsPage from './page';

const page = async (sp: Record<string, string> = {}) => render(await GiftCardsPage({ searchParams: Promise.resolve(sp) }));
const asha = { id: 'u1', name: 'Asha', email: 'asha@example.com' };

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = null;
  state.balance = null;
  state.history = [];
  state.demo = null;
  state.demoAmount = null;
  state.purchases = [];
  state.stripe = true;
});

const purchase = (over: Partial<GiftCardPurchase> = {}): GiftCardPurchase => ({
  id: 'p1', market: 'US', amountMinor: 5000, currency: 'USD', recipientName: 'Ravi', message: 'Happy birthday!', status: 'paid',
  code: 'ZZZZ-YYYYYY-XXXX', redeemed: false, reload: false, createdAt: '2026-10-05T10:00:00Z', paidAt: '2026-10-05T10:01:00Z', ...over,
});

it('signed out, buying starts with signing in and comes back to the form', async () => {
  await page();
  const tiles = screen.getAllByRole('link', { name: /Buy$/ });
  expect(tiles[0]).toHaveAttribute('href', `/signin?next=${encodeURIComponent('/gift-cards#buy')}`);
  expect(screen.getByRole('link', { name: 'Birthday' })).toHaveAttribute('href', `/signin?next=${encodeURIComponent('/gift-cards?occasion=Birthday#buy')}`);
  expect(screen.queryByRole('button', { name: /Buy .* gift card/ })).toBeNull();
});

it('signed in, picks an amount and buys; an occasion prefills the message', async () => {
  state.user = asha;
  state.balance = 0;
  await page({ occasion: 'Birthday' });
  expect(screen.getByRole('button', { name: 'Buy $50 gift card' })).toBeEnabled();
  expect(screen.getByLabelText(/Message/)).toHaveValue('Happy birthday!');
  expect(screen.getByRole('link', { name: 'Thank you' })).toHaveAttribute('href', `/gift-cards?occasion=${encodeURIComponent('Thank you')}#buy`);
});

it('without card payments, says gift cards can’t be bought', async () => {
  state.user = asha;
  state.balance = 0;
  state.stripe = false;
  await page();
  expect(screen.getByText(/Card payments aren’t set up here/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Buy/ })).toBeNull();
});

it('lists bought gift cards with their codes, and the one just bought', async () => {
  state.user = asha;
  state.balance = 0;
  state.purchases = [purchase(), purchase({ id: 'p0', recipientName: null, message: null, redeemed: true, code: 'AAAA-BBBBBB-CCCC', amountMinor: 2500 })];
  await page({ bought: 'p1' });
  expect(screen.getByText(/Your \$50 gift card is ready/)).toHaveTextContent('ZZZZ-YYYYYY-XXXX');
  expect(screen.getByText(/Give the code to Ravi/)).toBeInTheDocument();
  expect(screen.getByDisplayValue('AAAA-BBBBBB-CCCC')).toBeInTheDocument();
  expect(screen.getByText('Redeemed')).toBeInTheDocument();
  expect(screen.getByText('Not redeemed yet')).toBeInTheDocument();
  expect(screen.getByText('“Happy birthday!”')).toBeInTheDocument();
});

it('back from Stripe without paying, or with an error, says so', async () => {
  state.user = asha;
  state.balance = 0;
  await page({ canceled: '1' });
  expect(screen.getByText(/Payment canceled/)).toBeInTheDocument();
  cleanup();
  await page({ error: 'payments_unavailable' });
  expect(screen.getByText('Card payments are unavailable right now.')).toBeInTheDocument();
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

it('signed in, reloads the balance by card; a paid reload says so and isn’t listed as a gift card', async () => {
  state.user = asha;
  state.balance = 10000;
  state.purchases = [purchase({ id: 'r1', reload: true, recipientName: null, message: null, code: null, amountMinor: 10000 })];
  const { container } = await page({ reloaded: 'r1' });
  const balance = container.querySelector('#balance') as HTMLElement;
  expect(balance).toHaveTextContent('$100 added to your balance.');
  expect(screen.getByRole('heading', { name: 'Reload your balance' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reload $50' })).toBeEnabled();
  expect(container.querySelector('#reload')).not.toBeNull();
  expect(screen.queryByRole('heading', { name: 'Gift cards you bought' })).toBeNull();
});

it('a canceled reload says so by the balance, not the gift cards', async () => {
  state.user = asha;
  state.balance = 0;
  const { container } = await page({ canceled: '1', for: 'reload' });
  expect((container.querySelector('#balance') as HTMLElement).textContent).toMatch(/Payment canceled/);
  expect((container.querySelector('#buy') as HTMLElement).textContent).not.toMatch(/Payment canceled/);
});

it('India adds money to the balance, and shows it in the activity', async () => {
  state.store = amazonIn;
  state.user = asha;
  state.balance = 100_000;
  state.history = [{ id: 9, amountMinor: 100_000, kind: 'reload', orderId: null, giftCardCode: null, at: '2026-10-05T10:00:00Z' }];
  await page();
  expect(screen.getByRole('heading', { name: 'Add money to your balance' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add ₹1,000' })).toBeEnabled();
  expect(screen.getByText('Money added by card')).toBeInTheDocument();
});

it('without card payments, there’s no reloading', async () => {
  state.user = asha;
  state.balance = 0;
  state.stripe = false;
  const { container } = await page();
  expect(container.querySelector('#reload')).toBeNull();
});
