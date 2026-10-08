import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { PayLater, PayLaterRepayment } from '@/lib/data/pay-later';
import type { Transaction } from '@/lib/data/transactions';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  offer: 6_000_000 as number | null,
  account: null as unknown,
  transactions: [] as unknown[],
  repayments: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/app/actions/pay-later', () => ({ activatePayLaterAction: async () => {}, repayPayLaterAction: async () => {} }));
vi.mock('@/lib/data/transactions', () => ({ listTransactions: async () => state.transactions }));
vi.mock('@/lib/data/pay-later', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/pay-later')>()),
  payLaterOffer: async () => state.offer,
  payLater: async () => state.account,
  listPayLaterRepayments: async () => state.repayments,
}));

import PayLaterPage from './page';

const page = async (sp: Record<string, string> = {}) => render(await PayLaterPage({ searchParams: Promise.resolve(sp) }));
const asha = { id: 'u1', name: 'Asha', email: 'asha@example.com' };

const ACCOUNT: PayLater = {
  market: 'IN',
  activatedAt: '2026-09-01T10:00:00Z',
  limitMinor: 6_000_000,
  usedMinor: 1_550_000,
  creditMinor: 0,
  availableMinor: 4_450_000,
  billMinor: 1_200_000,
  unbilledMinor: 350_000,
  dueOn: '2026-10-05',
  overdue: false,
};

const charge = (over: Partial<Transaction>): Transaction => ({
  key: 'order:402-1', kind: 'charge', source: 'order', amountMinor: 350_000, at: '2026-10-03T09:00:00Z',
  status: 'completed', method: 'paylater', paymentLabel: 'Pay Later', orderId: '402-1', ...over,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  // the next bill is made on the 1st after today
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
  state.store = amazonIn;
  state.user = null;
  state.offer = 6_000_000;
  state.account = null;
  state.transactions = [];
  state.repayments = [];
});

it('is amazon.in only', async () => {
  state.store = amazon;
  state.offer = null;
  await expect(page()).rejects.toThrow('NOT_FOUND');
});

it('signed out, offers signing in to activate the limit', async () => {
  await page();
  expect(screen.getByText(/get ₹60,000 to spend/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in to activate' })).toHaveAttribute('href', '/in/signin?next=/amazon-pay/later');
});

it('signed in without an account, offers activating it', async () => {
  state.user = asha;
  await page();
  expect(screen.getByText('₹60,000')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Activate Pay Later' })).toBeInTheDocument();
  expect(screen.queryByText('Available limit')).toBeNull();
});

it('shows the limit, the bill and what goes on the next one, with ways to repay', async () => {
  state.user = asha;
  state.account = ACCOUNT;
  await page({ activated: '1' });
  expect(screen.getByText(/Pay Later is ready: you have ₹44,500 to spend/)).toBeInTheDocument();
  expect(screen.getByText('₹44,500')).toBeInTheDocument();
  expect(screen.getByText('of ₹60,000')).toBeInTheDocument();
  expect(screen.getByText('₹12,000')).toBeInTheDocument();
  expect(screen.getByText('Due by Monday, 5 October')).toBeInTheDocument();
  expect(screen.getByText(/spent since the 1st goes on your next bill, on 1 November/)).toBeInTheDocument();
  const form = screen.getByRole('button', { name: 'Pay now' }).closest('form')!;
  expect(within(form).getByLabelText(/Your bill: ₹12,000/)).toBeChecked();
  expect(within(form).getByLabelText(/Everything you owe: ₹15,500/)).not.toBeChecked();
  expect(within(form).getByLabelText('UPI')).toBeChecked();
});

it('warns when the bill is overdue', async () => {
  state.user = asha;
  state.account = { ...ACCOUNT, overdue: true };
  await page();
  expect(screen.getByRole('alert')).toHaveTextContent('Your bill of ₹12,000 was due on Monday, 5 October. Pay it to use Pay Later again.');
  expect(screen.getByText('Overdue: it was due on Monday, 5 October')).toBeInTheDocument();
});

it('with nothing owed, says so and has nothing to repay', async () => {
  state.user = asha;
  state.account = { ...ACCOUNT, usedMinor: 0, availableMinor: 6_000_000, billMinor: 0, unbilledMinor: 0, dueOn: undefined };
  await page({ repaid: '1200000' });
  expect(screen.getByText('Thanks, ₹12,000 is repaid.')).toBeInTheDocument();
  expect(screen.getByText(/Nothing to pay/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pay now' })).toBeNull();
  expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
});

it('lists Pay Later purchases, refunds and repayments, newest first, and nothing else', async () => {
  state.user = asha;
  state.account = ACCOUNT;
  state.transactions = [
    charge({}),
    charge({ key: 'cancel:402-0', kind: 'refund', source: 'cancellation', amountMinor: 50_000, at: '2026-10-02T09:00:00Z', orderId: '402-0' }),
    charge({ key: 'order:402-9', method: 'upi', paymentLabel: 'UPI', orderId: '402-9', at: '2026-10-04T09:00:00Z' }),
  ];
  state.repayments = [{ id: 'r1', amountMinor: 100_000, method: 'netbanking', bank: 'HDFC Bank', at: '2026-10-01T09:00:00Z' } satisfies PayLaterRepayment];
  await page({ error: 'amount' });
  expect(screen.getByText(/Enter an amount more than nothing/)).toBeInTheDocument();
  const items = screen.getAllByRole('listitem').map((li) => li.textContent);
  expect(items.filter((t) => /Order|Refund|Repayment/.test(t ?? ''))).toEqual([
    expect.stringMatching(/^Order 402-1.*₹3,500$/),
    expect.stringMatching(/^Refund · order 402-0.*−₹500$/),
    expect.stringMatching(/^Repayment · Net banking · HDFC Bank.*−₹1,000$/),
  ]);
  expect(screen.getByRole('link', { name: 'Order 402-1' })).toHaveAttribute('href', '/in/orders/402-1');
});
