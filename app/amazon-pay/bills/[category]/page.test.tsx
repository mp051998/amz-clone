import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { Bill, Biller, BillPayment } from '@/lib/data/bills';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  billers: [] as unknown[],
  bill: null as unknown,
  payments: [] as unknown[],
  balance: null as number | null,
  billerCalls: [] as unknown[],
  fetchCalls: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/app/actions/bills', () => ({ payBillAction: async () => {} }));
vi.mock('@/lib/data/balance', () => ({ storeBalance: async () => state.balance }));
vi.mock('@/lib/data/bills', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/bills')>()),
  listBillers: async (...args: unknown[]) => (state.billerCalls.push(args.slice(1)), state.billers),
  listBillPayments: async () => state.payments,
  fetchBill: async (...args: unknown[]) => {
    state.fetchCalls.push(args.slice(1));
    if (!state.bill) throw new Error('down');
    return state.bill;
  },
}));

import BillsPage from './page';

const page = async (category: string, sp: Record<string, string> = {}) =>
  render(await BillsPage({ params: Promise.resolve({ category }), searchParams: Promise.resolve(sp) }));
const asha = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
const section = (name: string) => screen.getByRole('heading', { name }).closest('section') as HTMLElement;

const BESCOM: Biller = {
  id: 'bescom', category: 'electricity', name: 'BESCOM (Bengaluru)', accountLabel: 'Account ID', accountHint: '10 digits',
  accountPattern: '^[0-9]{10}$', fetches: true, minMinor: 10_000, maxMinor: 10_000_000,
};
const MSEDCL: Biller = { ...BESCOM, id: 'msedcl', name: 'MSEDCL (Maharashtra)', accountLabel: 'Consumer number', accountHint: '12 digits', accountPattern: '^[0-9]{12}$' };
const TATA_PLAY: Biller = {
  id: 'tata-play', category: 'dth', name: 'Tata Play', accountLabel: 'Subscriber ID', accountHint: '10 digits',
  accountPattern: '^[0-9]{10}$', fetches: false, minMinor: 10_000, maxMinor: 2_500_000,
};
const BILL: Bill = { billerId: 'bescom', account: '1234567890', period: '2026-10-01', amountMinor: 315_500, dueOn: '2026-10-20', overdue: false };

const payment = (over: Partial<BillPayment> = {}): BillPayment => ({
  id: 'p1', billerId: 'bescom', category: 'electricity', billerName: 'BESCOM (Bengaluru)', account: '1234567890',
  period: '2026-10-01', amountMinor: 315_500, method: 'upi', at: '2026-10-05T10:00:00Z', ...over,
});

afterEach(cleanup);
beforeEach(() => {
  state.store = amazonIn;
  state.user = asha;
  state.billers = [BESCOM, MSEDCL];
  state.bill = BILL;
  state.payments = [];
  state.balance = 500_000;
  state.billerCalls = [];
  state.fetchCalls = [];
});

it('is amazon.in’s only, for the kinds of biller it pays', async () => {
  state.store = amazon;
  await expect(page('electricity')).rejects.toThrow('NOT_FOUND');
  state.store = amazonIn;
  await expect(page('rent')).rejects.toThrow('NOT_FOUND');
});

it('asks for the biller and account first, linking the other kinds of bill', async () => {
  await page('electricity');
  expect(screen.getByRole('heading', { name: 'Electricity bill' })).toBeInTheDocument();
  expect(state.billerCalls).toEqual([['IN', 'electricity']]);
  expect(within(screen.getByRole('combobox', { name: 'Biller' })).getAllByRole('option').map((o) => o.textContent)).toEqual([
    'Choose', 'BESCOM (Bengaluru)', 'MSEDCL (Maharashtra)',
  ]);
  expect(screen.getByLabelText('Consumer number')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Fetch bill' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: 'Pay bills' });
  expect(within(nav).getByRole('link', { name: 'Electricity' })).toHaveAttribute('aria-current', 'page');
  expect(within(nav).getByRole('link', { name: 'FASTag' })).toHaveAttribute('href', '/in/amazon-pay/bills/fastag');
  expect(state.fetchCalls).toEqual([]);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('says what’s wrong with the biller or account', async () => {
  await page('electricity', { biller: 'bescom', account: '12345' });
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid Account ID: 10 digits.');
  expect(screen.getByLabelText('Account ID')).toHaveValue('12345');
  cleanup();
  await page('electricity', { biller: 'tata-play', account: '1234567890' });
  expect(screen.getByRole('alert')).toHaveTextContent('Choose your biller.');
  expect(state.fetchCalls).toEqual([]);
});

it('fetches this month’s bill and pays it in full', async () => {
  await page('electricity', { biller: 'bescom', account: '12345 67890' });
  expect(state.fetchCalls).toEqual([['bescom', '1234567890']]);
  const bill = section('BESCOM (Bengaluru)');
  expect(bill).toHaveTextContent('Account ID 1234567890');
  expect(bill).toHaveTextContent('Bill for October 2026');
  expect(bill).toHaveTextContent('₹3,155');
  expect(bill).toHaveTextContent('Due 20 October');
  expect(within(bill).getByRole('radio', { name: /Wallet balance/ })).toBeChecked();
  expect(within(bill).getByRole('button', { name: 'Pay ₹3,155' })).toBeInTheDocument();
  expect(document.querySelector('input[name="bill"]')).toHaveValue('315500');
  expect(document.querySelector('input[name="account"][type="hidden"]')).toHaveValue('1234567890');
});

it('shows an overdue bill, a paid one without the form, and a bill it couldn’t fetch', async () => {
  state.bill = { ...BILL, overdue: true };
  await page('electricity', { biller: 'bescom', account: '1234567890' });
  expect(screen.getByText('Overdue: was due 20 October')).toBeInTheDocument();
  cleanup();
  state.bill = { ...BILL, paid: { id: 'p1', amountMinor: 315_500, at: '2026-10-05T10:00:00Z' } };
  await page('electricity', { biller: 'bescom', account: '1234567890' });
  expect(screen.getByRole('status')).toHaveTextContent('You paid this bill on 5 October. Nothing more is due this month.');
  expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();
  cleanup();
  state.bill = null;
  await page('electricity', { biller: 'bescom', account: '1234567890' });
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t fetch this bill.');
});

it('takes an amount for a biller without bills, and shows a refusal by the form', async () => {
  state.billers = [TATA_PLAY];
  state.balance = 0;
  await page('dth', { biller: 'tata-play', account: '1234567890', amount: '50', error: 'amount' });
  expect(state.fetchCalls).toEqual([]);
  expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue('tata-play');
  expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  const pay = section('Tata Play');
  expect(within(pay).getByLabelText(/Amount/)).toHaveValue('50');
  expect(pay).toHaveTextContent('₹100 to ₹25,000, in whole rupees');
  expect(within(pay).getByRole('alert')).toHaveTextContent('Enter an amount in whole rupees, from ₹100 to ₹25,000.');
  expect(within(pay).getByRole('radio', { name: 'UPI' })).toBeChecked();
  expect(within(pay).getByRole('button', { name: 'Pay' })).toBeInTheDocument();
});

it('signed out, shows the bill and sends to sign in, coming back to it', async () => {
  state.user = null;
  state.balance = null;
  await page('electricity', { biller: 'bescom', account: '1234567890' });
  expect(screen.getByText('Bill for October 2026')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();
  expect(screen.getByRole('link', { name: 'Sign in to pay' })).toHaveAttribute(
    'href',
    `/in/signin?next=${encodeURIComponent('/amazon-pay/bills/electricity?biller=bescom&account=1234567890')}`,
  );
});

it('confirms a payment, and lists accounts to pay again', async () => {
  state.bill = { ...BILL, paid: { id: 'p1', amountMinor: 315_500, at: '2026-10-05T10:00:00Z' } };
  state.payments = [
    payment(),
    payment({ id: 'p2', billerId: 'msedcl', billerName: 'MSEDCL (Maharashtra)', account: '123456789012', amountMinor: 120_000, at: '2026-10-02T10:00:00Z' }),
    payment({ id: 'p3', period: '2026-09-01', at: '2026-09-10T10:00:00Z' }),
  ];
  await page('electricity', { biller: 'bescom', account: '1234567890', done: 'p1' });
  expect(screen.getByText('Payment of ₹3,155 to BESCOM (Bengaluru) for 1234567890 is done. Your October 2026 bill is paid.')).toBeInTheDocument();
  const again = section('Pay again');
  const links = within(again).getAllByRole('link', { name: 'Fetch bill' });
  expect(links).toHaveLength(2);
  expect(links[1]).toHaveAttribute('href', '/in/amazon-pay/bills/electricity?biller=msedcl&account=123456789012#pay');
  const list = section('Your payments');
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  expect(list).toHaveTextContent('September 2026 bill');
});
