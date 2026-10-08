import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { MyRecall, Recall } from '@/lib/data/recalls';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: null as unknown,
  all: [] as unknown[],
  mine: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/recalls', () => ({
  listRecalls: async () => state.all,
  myRecalls: async () => state.mine,
}));

import RecallsPage from './page';

const recall = (over: Partial<Recall> = {}): Recall => ({
  productId: 'k',
  title: 'Electric Kettle 1.7L',
  image: '/img/k.jpg',
  hazard: 'The handle can overheat.',
  remedy: 'Stop using it and return it for a full refund.',
  issuedAt: '2026-10-04T08:00:00Z',
  updatedAt: '2026-10-04T08:00:00Z',
  ...over,
});

beforeEach(() => {
  state.store = amazon;
  state.user = null;
  state.all = [];
  state.mine = [];
});
afterEach(cleanup);

it('lists the store’s recalls with the hazard and what to do, and asks a guest to sign in', async () => {
  state.all = [recall(), recall({ productId: 'm', title: 'Mug', hazard: 'The glaze contains lead.', issuedAt: '2026-09-01T08:00:00Z' })];
  render(await RecallsPage());
  expect(screen.getByRole('heading', { level: 1, name: 'Recalls and Product Safety Alerts' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin?next=/recalls');
  const [kettle, mug] = screen.getAllByRole('listitem');
  expect(kettle).toHaveAttribute('id', 'recall-k');
  expect(within(kettle).getByRole('link', { name: 'Electric Kettle 1.7L' })).toHaveAttribute('href', '/product/k');
  expect(kettle).toHaveTextContent('Recalled October 4, 2026');
  expect(kettle).toHaveTextContent('Hazard: The handle can overheat.');
  expect(kettle).toHaveTextContent('What to do: Stop using it and return it for a full refund.');
  expect(mug).toHaveTextContent('The glaze contains lead.');
});

it('puts the shopper’s own recalled items first, with the order, and anchors there', async () => {
  state.user = { id: 'u1' };
  state.all = [recall(), recall({ productId: 'm', title: 'Mug' })];
  state.mine = [{ ...recall(), orderId: 'A-1', orderedAt: '2026-08-01T00:00:00Z' } satisfies MyRecall];
  render(await RecallsPage());
  const yours = screen.getByRole('heading', { name: 'Your recalled items' }).closest('section')!;
  const [own] = within(yours).getAllByRole('listitem');
  expect(own).toHaveAttribute('id', 'recall-k');
  expect(within(own).getByRole('link', { name: /order A-1/ })).toHaveAttribute('href', '/orders/A-1?placed=0');
  const store = screen.getByRole('heading', { name: 'Recent recalls in this store' }).closest('section')!;
  const [kettle, mug] = within(store).getAllByRole('listitem');
  // one anchor per recall: the shopper's own copy has it
  expect(kettle).not.toHaveAttribute('id');
  expect(mug).toHaveAttribute('id', 'recall-m');
  expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
});

it('says when nothing the shopper bought, or nothing in the store, has been recalled', async () => {
  state.store = amazonIn;
  state.user = { id: 'u1' };
  render(await RecallsPage());
  expect(screen.getByText('Nothing you’ve bought in this store has been recalled.')).toBeInTheDocument();
  expect(screen.getByText('No products sold here have been recalled.')).toBeInTheDocument();
});
