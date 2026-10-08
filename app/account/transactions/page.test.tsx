import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { Transaction } from '@/lib/data/transactions';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', name: 'Asha', email: 'asha@example.com' } as unknown,
  list: [] as unknown[],
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
vi.mock('@/lib/data/transactions', () => ({ listTransactions: async () => state.list }));

import TransactionsPage from './page';

const tx = (over: Partial<Transaction>): Transaction => ({
  key: 'order:A',
  kind: 'charge',
  source: 'order',
  amountMinor: 2599,
  at: '2026-10-03T15:00:00Z',
  status: 'completed',
  method: 'card',
  paymentLabel: 'Visa ending 4242',
  orderId: 'A-1',
  ...over,
});

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.list = [];
});

it('sends the signed-out to sign in (India store paths too)', async () => {
  state.user = null;
  await expect(TransactionsPage()).rejects.toThrow('REDIRECT /signin?next=/account/transactions');
  state.store = amazonIn;
  await expect(TransactionsPage()).rejects.toThrow('REDIRECT /in/signin?next=/account/transactions');
});

it('says when there is nothing yet', async () => {
  render(await TransactionsPage());
  expect(screen.getByText('No transactions yet')).toBeInTheDocument();
});

it('groups charges and refunds by day, linking to their orders', async () => {
  state.list = [
    tx({ key: 'return:r1', kind: 'refund', source: 'return', amountMinor: 1200, at: '2026-10-05T15:00:00Z', status: 'pending' }),
    tx({ key: 'gift:g1', source: 'gift_card', amountMinor: 5000, at: '2026-10-05T14:00:00Z', paymentLabel: 'Card', orderId: undefined }),
    tx({}),
    tx({ key: 'order:C', method: 'cod', paymentLabel: 'Cash on delivery', status: 'due', orderId: 'C-9', at: '2026-10-03T09:00:00Z' }),
  ];
  render(await TransactionsPage());
  const oct5 = screen.getByRole('region', { name: 'October 5, 2026' });
  expect(within(oct5).getAllByRole('listitem')).toHaveLength(2);
  expect(within(oct5).getByText('Refund: return')).toBeInTheDocument();
  expect(within(oct5).getByText(/^To Visa ending 4242/)).toBeInTheDocument();
  expect(within(oct5).getByText('Refund in progress')).toBeInTheDocument();
  expect(within(oct5).getByLabelText('Refund $12.00')).toHaveTextContent('+$12.00');
  expect(within(oct5).getByText('Gift card purchase')).toBeInTheDocument();
  expect(within(oct5).getByLabelText('Charge $50.00')).toHaveTextContent('−$50.00');

  const oct3 = screen.getByRole('region', { name: 'October 3, 2026' });
  expect(within(oct3).getByRole('link', { name: 'Order A-1' })).toHaveAttribute('href', '/orders/A-1?placed=0');
  expect(within(oct3).getByText(/^Pay on delivery/)).toBeInTheDocument();
  expect(within(oct3).getByText('Due on delivery')).toBeInTheDocument();
});

it('uses the store’s money and paths', async () => {
  state.store = amazonIn;
  state.list = [tx({ amountMinor: 49900, status: 'failed', kind: 'refund', source: 'cancellation', key: 'cancel:A' })];
  render(await TransactionsPage());
  expect(screen.getByLabelText('Refund ₹499')).toBeInTheDocument();
  expect(screen.getByText('Refund delayed. We’re retrying it.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Order A-1' })).toHaveAttribute('href', '/in/orders/A-1?placed=0');
});

it('shows a mobile recharge with its number and how it was paid', async () => {
  state.store = amazonIn;
  state.list = [
    tx({ key: 'recharge:m1', source: 'recharge', amountMinor: 29_900, method: 'amazonpay', paymentLabel: '', orderId: undefined, number: '9876543210' }),
    tx({ key: 'recharge:m2', source: 'recharge', amountMinor: 19_900, method: 'upi', paymentLabel: 'UPI', orderId: undefined, number: '9123456789' }),
  ];
  render(await TransactionsPage());
  const rows = screen.getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('Mobile recharge 98765 43210');
  expect(rows[0]).toHaveTextContent('Wallet balance');
  expect(rows[1]).toHaveTextContent('Mobile recharge 91234 56789');
  expect(rows[1]).toHaveTextContent('UPI');
  expect(within(rows[0]).queryByRole('link')).toBeNull();
});
