import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { PlusMembership } from '@/lib/data/plus';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  plus: null as PlusMembership | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/plus', () => ({ plusMembership: async () => state.plus }));
vi.mock('@/app/actions/plus', () => ({
  joinPlusAction: async () => {},
  leavePlusAction: async () => {},
  setDeliveryDayAction: async () => {},
  setPlusPlanAction: async () => {},
  setPlusRenewalAction: async () => {},
}));

import PlusPage from './page';

/** A US member on the monthly plan, renewing November 1. */
const MEMBER: PlusMembership = { since: '2026-10-01T18:00:00Z', market: 'US', plan: 'monthly', renewsAt: '2026-11-01T18:00:00Z', autoRenew: true };

const page = async (sp: { joined?: string; left?: string; day?: string; plan?: string; renew?: string } = {}) => render(await PlusPage({ searchParams: Promise.resolve(sp) }));

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = null;
  state.plus = null;
});

it('signed out, joining starts with a new account and comes back here', async () => {
  await page();
  const joins = screen.getAllByRole('link', { name: 'Join Plus' });
  expect(joins[0]).toHaveAttribute('href', '/signin?new=1&next=/prime');
  expect(screen.getByRole('link', { name: 'Choose annual' })).toHaveAttribute('href', '/signin?new=1&next=/prime');
});

it('signed in, the join buttons join at once (India store)', async () => {
  state.store = amazonIn;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  await page();
  expect(screen.queryByRole('link', { name: 'Join Plus' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Join Plus' }).length).toBeGreaterThan(0);
  // each plan's button joins on that plan
  const quarterly = screen.getByRole('button', { name: 'Choose 3 months' });
  expect(quarterly.closest('form')!.querySelector('input[name="plan"]')).toHaveValue('quarterly');
  expect(screen.getByRole('button', { name: 'Choose annual' }).closest('form')!.querySelector('input[name="plan"]')).toHaveValue('annual');
});

it('a member sees their membership, can end it, and is not sold plans', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = MEMBER;
  await page({ joined: '1' });
  expect(screen.getByRole('status')).toHaveTextContent('Welcome to Plus');
  expect(screen.getByText(/You're a Plus member since October 1, 2026/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Manage membership' })).toHaveAttribute('href', '#membership');
  expect(screen.getByRole('button', { name: 'End now' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Choose a plan' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Join Plus' })).toBeNull();
});

it('confirms a membership that just ended', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  await page({ left: '1' });
  expect(screen.getByRole('status')).toHaveTextContent('Your Plus membership has ended.');
});

it('a US member picks a Delivery Day', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = MEMBER;
  await page();
  expect(screen.getByRole('heading', { name: 'Your Delivery Day' })).toBeInTheDocument();
  expect(screen.getByLabelText('Delivery Day')).toHaveValue('5');
  expect(screen.getByRole('button', { name: 'Set Delivery Day' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
});

it('a member with a Delivery Day can change it or turn it off', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = { ...MEMBER, deliveryDay: 3 };
  await page({ day: '3' });
  expect(screen.getByRole('status')).toHaveTextContent('Your Delivery Day is Wednesday.');
  expect(screen.getByText('Wednesday', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByLabelText('Delivery Day')).toHaveValue('3');
  expect(screen.getByRole('button', { name: 'Change day' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Turn off' })).toHaveAttribute('name', 'off');
});

it('confirms Delivery Day turned off', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = MEMBER;
  await page({ day: 'off' });
  expect(screen.getByRole('status')).toHaveTextContent('Delivery Day is off.');
});

it('the India store has no Delivery Day', async () => {
  state.store = amazonIn;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = { ...MEMBER, deliveryDay: 3 };
  await page();
  expect(screen.queryByRole('heading', { name: 'Your Delivery Day' })).toBeNull();
});

const membership = () => within(screen.getByRole('heading', { name: 'Your membership' }).closest('section')!);

it('a member sees their plan and when it renews, and can switch plans or turn renewal off', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = MEMBER;
  await page();
  const m = membership();
  expect(m.getByText('Monthly plan')).toBeInTheDocument();
  expect(m.getByText('$14.99/month')).toBeInTheDocument();
  expect(m.getByText(/Renews on/)).toHaveTextContent('Renews on November 1, 2026.');
  const annual = m.getByRole('button', { name: 'Switch to the annual plan' });
  expect(annual.closest('form')!.querySelector('input[name="plan"]')).toHaveValue('annual');
  const off = m.getByRole('button', { name: 'End on November 1, 2026' });
  expect(off.closest('form')!.querySelector('input[name="renew"]')).toHaveValue('0');
  expect(m.getByRole('button', { name: 'End now' })).toBeInTheDocument();
  expect(m.queryByRole('button', { name: 'Keep my membership' })).toBeNull();
});

it('a switched plan shows from the renewal, and can be undone', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = { ...MEMBER, nextPlan: 'annual' };
  await page({ plan: 'annual' });
  const m = membership();
  expect(m.getByRole('status')).toHaveTextContent("You'll switch to the annual plan on November 1, 2026.");
  expect(m.getByText(/Switches to/)).toHaveTextContent('Switches to the annual plan ($139/year) on November 1, 2026.');
  expect(m.queryByRole('button', { name: 'Switch to the annual plan' })).toBeNull();
  expect(m.getByRole('button', { name: 'Keep the monthly plan' }).closest('form')!.querySelector('input[name="plan"]')).toHaveValue('monthly');
});

it('an India member can switch to either other plan, priced in rupees', async () => {
  state.store = amazonIn;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = { ...MEMBER, market: 'IN', plan: 'quarterly' };
  await page({ plan: 'quarterly' });
  const m = membership();
  expect(m.getByRole('status')).toHaveTextContent("You're staying on the 3-month plan.");
  expect(m.getByText('₹599/3 months')).toBeInTheDocument();
  expect(m.getByRole('button', { name: 'Switch to the monthly plan' })).toBeInTheDocument();
  expect(m.getByRole('button', { name: 'Switch to the annual plan' })).toBeInTheDocument();
  expect(m.getByText(/Renews on/)).toHaveTextContent('Renews on 1 November 2026.');
});

it("with renewal off, the membership ends at the period's end and can be kept", async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = { ...MEMBER, autoRenew: false };
  await page({ renew: 'off' });
  const m = membership();
  expect(m.getByRole('status')).toHaveTextContent("Your membership won't renew. It ends on November 1, 2026");
  expect(m.getByText(/Ends on/)).toHaveTextContent('Ends on November 1, 2026. You keep FREE delivery and every other benefit until then.');
  const keep = m.getByRole('button', { name: 'Keep my membership' });
  expect(keep.closest('form')!.querySelector('input[name="renew"]')).toHaveValue('1');
  expect(m.queryByRole('button', { name: /Switch to/ })).toBeNull();
  expect(m.getByRole('button', { name: 'End now' })).toBeInTheDocument();
});

it('confirms renewal turned back on', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = MEMBER;
  await page({ renew: 'on' });
  expect(membership().getByRole('status')).toHaveTextContent('Your membership will renew on November 1, 2026.');
});
