import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({ store: null as unknown, user: null as unknown, balance: null as number | null }));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/balance', () => ({ storeBalance: async () => state.balance }));

import StorePayPage from './page';

const page = async () => render(await StorePayPage());
const asha = { id: 'u1', name: 'Asha', email: 'asha@example.com' };

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = null;
  state.balance = null;
});

it('signed out, setting up starts with an account and the balance card points to redeeming', async () => {
  await page();
  expect(screen.getByRole('link', { name: 'Set up Store Pay' })).toHaveAttribute('href', '/signin?new=1&next=%2Famazon-pay');
  expect(screen.getByRole('link', { name: /Redeem a gift card/ })).toHaveAttribute('href', '/gift-cards#balance');
  expect(screen.queryByText('Your store balance')).toBeNull();
});

it('signed in, shows the real balance and never sends the shopper to sign up', async () => {
  state.user = asha;
  state.balance = 4250;
  await page();
  expect(screen.getByText('Your store balance')).toBeInTheDocument();
  expect(screen.getByText('$42.50')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Manage your balance' })).toHaveAttribute('href', '/gift-cards#balance');
  expect(screen.getByRole('link', { name: 'See Plus benefits' })).toHaveAttribute('href', '/prime');
  for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).not.toContain('/signin');
});

it('IN: the balance tile is real; the illustrative ones aren’t links once signed in', async () => {
  state.store = amazonIn;
  state.user = asha;
  state.balance = 0;
  await page();
  expect(screen.getByText('Store Pay balance')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Pay balance' })).toHaveAttribute('href', '/in/gift-cards#balance');
  expect(screen.getByText('Scan any QR').closest('a')).toBeNull();
  expect(screen.getByText('Electricity').closest('a')).toBeNull();
  expect(screen.getByRole('link', { name: 'Add to your balance' })).toBeInTheDocument();
});

it('says so when the balance can’t be read', async () => {
  state.user = asha;
  await page();
  expect(screen.getByText(/can’t be shown right now/)).toBeInTheDocument();
});
