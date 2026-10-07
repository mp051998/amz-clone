import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  plus: null as { since: string; deliveryDay?: number } | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/plus', () => ({ plusMembership: async () => state.plus }));
vi.mock('@/app/actions/plus', () => ({ joinPlusAction: async () => {}, leavePlusAction: async () => {}, setDeliveryDayAction: async () => {} }));

import PlusPage from './page';

const page = async (sp: { joined?: string; left?: string; day?: string } = {}) => render(await PlusPage({ searchParams: Promise.resolve(sp) }));

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
  expect(screen.getByRole('button', { name: 'Choose 3 months' })).toBeInTheDocument();
});

it('a member sees their membership, can end it, and is not sold plans', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = { since: '2026-10-01T18:00:00Z' };
  await page({ joined: '1' });
  expect(screen.getByRole('status')).toHaveTextContent('Welcome to Plus');
  expect(screen.getByText(/You're a Plus member since October 1, 2026/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'End membership' })).toBeInTheDocument();
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
  state.plus = { since: '2026-10-01T18:00:00Z' };
  await page();
  expect(screen.getByRole('heading', { name: 'Your Delivery Day' })).toBeInTheDocument();
  expect(screen.getByLabelText('Delivery Day')).toHaveValue('5');
  expect(screen.getByRole('button', { name: 'Set Delivery Day' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
});

it('a member with a Delivery Day can change it or turn it off', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = { since: '2026-10-01T18:00:00Z', deliveryDay: 3 };
  await page({ day: '3' });
  expect(screen.getByRole('status')).toHaveTextContent('Your Delivery Day is Wednesday.');
  expect(screen.getByText('Wednesday', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByLabelText('Delivery Day')).toHaveValue('3');
  expect(screen.getByRole('button', { name: 'Change day' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Turn off' })).toHaveAttribute('name', 'off');
});

it('confirms Delivery Day turned off', async () => {
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = { since: '2026-10-01T18:00:00Z' };
  await page({ day: 'off' });
  expect(screen.getByRole('status')).toHaveTextContent('Delivery Day is off.');
});

it('the India store has no Delivery Day', async () => {
  state.store = amazonIn;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.plus = { since: '2026-10-01T18:00:00Z', deliveryDay: 3 };
  await page();
  expect(screen.queryByRole('heading', { name: 'Your Delivery Day' })).toBeNull();
});
