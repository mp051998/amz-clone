import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  plus: null as { since: string } | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/plus', () => ({ plusMembership: async () => state.plus }));
vi.mock('@/app/actions/plus', () => ({ joinPlusAction: async () => {}, leavePlusAction: async () => {} }));

import PlusPage from './page';

const page = async (sp: { joined?: string; left?: string } = {}) => render(await PlusPage({ searchParams: Promise.resolve(sp) }));

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
