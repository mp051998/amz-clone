import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { Recharge, RechargePlan } from '@/lib/data/recharges';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  plans: [] as unknown[],
  recharges: [] as unknown[],
  balance: null as number | null,
  planCalls: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/app/actions/recharge', () => ({ rechargeAction: async () => {} }));
vi.mock('@/lib/data/balance', () => ({ storeBalance: async () => state.balance }));
vi.mock('@/lib/data/recharges', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/recharges')>()),
  listRechargePlans: async (...args: unknown[]) => (state.planCalls.push(args.slice(1)), state.plans),
  listRecharges: async () => state.recharges,
}));

import RechargePage from './page';

const page = async (sp: Record<string, string> = {}) => render(await RechargePage({ searchParams: Promise.resolve(sp) }));
const asha = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
const READY = { number: '+91 98765 43210', operator: 'Jio', circle: 'Mumbai' };

const PLANS: RechargePlan[] = [
  { id: 'jio-299', operator: 'Jio', amountMinor: 29_900, validityDays: 28, data: '1.5 GB/day', calls: 'Unlimited', sms: '100/day', kind: 'unlimited' },
  { id: 'jio-3599', operator: 'Jio', amountMinor: 359_900, validityDays: 365, data: '2.5 GB/day', calls: 'Unlimited', sms: '100/day', kind: 'unlimited' },
  { id: 'jio-19', operator: 'Jio', amountMinor: 1_900, data: '1 GB', kind: 'data' },
];

const recharge = (over: Partial<Recharge> = {}): Recharge => ({
  id: 'r1', number: '9876543210', operator: 'Jio', circle: 'Mumbai', planId: 'jio-299', amountMinor: 29_900,
  cashbackMinor: 500, method: 'upi', at: '2026-10-05T10:00:00Z', ...over,
});

afterEach(cleanup);
beforeEach(() => {
  state.store = amazonIn;
  state.user = asha;
  state.plans = PLANS;
  state.recharges = [];
  state.balance = 50_000;
  state.planCalls = [];
});

it('is amazon.in’s only', async () => {
  state.store = amazon;
  await expect(page()).rejects.toThrow('NOT_FOUND');
});

it('asks for the number, operator and circle first, without plans', async () => {
  await page();
  expect(screen.getByRole('heading', { name: 'Mobile recharge' })).toBeInTheDocument();
  expect(screen.getByLabelText('Mobile number')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'See plans' })).toBeInTheDocument();
  expect(screen.queryByText('Unlimited plans')).toBeNull();
  expect(state.planCalls).toEqual([]);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('says what’s wrong with the details', async () => {
  await page({ ...READY, number: '12345' });
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a 10-digit mobile number.');
  expect(screen.getByLabelText('Mobile number')).toHaveValue('12345');
  cleanup();
  await page({ ...READY, circle: 'Atlantis' });
  expect(screen.getByRole('alert')).toHaveTextContent('Choose the number’s circle.');
  expect(screen.queryByText('Unlimited plans')).toBeNull();
});

it('lists the operator’s plans with their cashback, and the ways to pay', async () => {
  await page(READY);
  expect(state.planCalls).toEqual([['IN', 'Jio']]);
  expect(screen.getByRole('heading', { name: 'Jio plans for 98765 43210' })).toBeInTheDocument();
  const unlimited = screen.getByRole('group', { name: 'Unlimited plans' });
  const radios = within(unlimited).getAllByRole('radio');
  expect(radios).toHaveLength(2);
  expect(radios[0]).toBeChecked();
  expect(unlimited).toHaveTextContent('28 days · 1.5 GB/day · Unlimited calls · 100/day SMS');
  expect(unlimited).toHaveTextContent('₹5 cashback');
  // capped at ₹25
  expect(unlimited).toHaveTextContent('₹25 cashback');
  const packs = screen.getByRole('group', { name: 'Data packs' });
  expect(packs).toHaveTextContent('Your current plan’s validity · 1 GB');
  // under ₹50: none
  expect(packs).not.toHaveTextContent('cashback');
  const pay = screen.getByRole('group', { name: 'Pay with' });
  expect(within(pay).getByRole('radio', { name: /Wallet balance/ })).toBeChecked();
  expect(pay).toHaveTextContent('₹500 available');
  expect(within(pay).getByRole('combobox', { name: 'Bank' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Recharge' })).toBeInTheDocument();
  // the number goes with the form as ten digits
  expect(document.querySelector('input[name="number"][type="hidden"]')).toHaveValue('9876543210');
});

it('defaults to UPI with an empty balance, and shows a refusal by the form', async () => {
  state.balance = 0;
  await page({ ...READY, error: 'balance' });
  expect(screen.getByRole('radio', { name: 'UPI' })).toBeChecked();
  expect(screen.getByRole('alert')).toHaveTextContent('Your balance doesn’t cover this plan.');
});

it('signed out, shows the plans and sends to sign in, coming back to them', async () => {
  state.user = null;
  state.balance = null;
  await page(READY);
  expect(screen.getByRole('group', { name: 'Unlimited plans' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Recharge' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Sign in to recharge' })).toHaveAttribute(
    'href',
    `/in/signin?next=${encodeURIComponent('/amazon-pay/recharge?number=9876543210&operator=Jio&circle=Mumbai')}`,
  );
});

it('confirms a recharge, and lists recent numbers to recharge again', async () => {
  state.recharges = [
    recharge(),
    recharge({ id: 'r2', number: '9123456789', operator: 'Airtel', circle: 'Delhi NCR', amountMinor: 19_900, cashbackMinor: 300, at: '2026-10-01T10:00:00Z' }),
    recharge({ id: 'r3', at: '2026-09-20T10:00:00Z' }),
  ];
  await page({ ...READY, done: 'r1' });
  expect(screen.getByText(/Recharge of ₹299 for 98765 43210 \(Jio, Mumbai\) is done\. ₹5 cashback is in your balance\./)).toBeInTheDocument();
  const section = (name: string) => screen.getByRole('heading', { name }).closest('section') as HTMLElement;
  const again = section('Recharge again');
  const links = within(again).getAllByRole('link', { name: 'Recharge again' });
  expect(links).toHaveLength(2);
  expect(links[1]).toHaveAttribute('href', '/in/amazon-pay/recharge?number=9123456789&operator=Airtel&circle=Delhi+NCR#pay');
  expect(within(section('Your recharges')).getAllByRole('listitem')).toHaveLength(3);
});
