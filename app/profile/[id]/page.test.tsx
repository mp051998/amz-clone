import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { ReviewerProfile } from '@/lib/data/reviews';
import { product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({ store: null as unknown, profile: null as unknown, asked: [] as unknown[] }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/reviews', () => ({
  reviewerProfile: async (_db: unknown, market: string, id: string, page: number) => (state.asked.push([market, id, page]), state.profile),
}));

import ProfilePage from './page';

const ID = '11111111-2222-4333-8444-555555555555';
const review = (id: string, over: Record<string, unknown> = {}) => ({
  id, author: 'Priya S', authorId: ID, initial: 'P', rating: 4, title: `Title ${id}`, body: 'Boils in two minutes.', createdAt: '2026-10-02T12:00:00Z',
  verified: true, helpful: 3, mine: false, votedHelpful: false, reported: false, photos: [], ...over,
});
const profile = (over: Partial<ReviewerProfile> = {}): ReviewerProfile => ({
  name: 'Priya S', initial: 'P', total: 2, helpful: 4, page: 1, pageCount: 1,
  reviews: [
    { review: review('r1'), product: product({ id: 'k 1', title: 'Kettle' }) },
    { review: review('r2', { verified: false, helpful: 1, rating: 2 }), product: product({ id: 'm', title: 'Mug' }) },
  ],
  ...over,
});
const show = async (sp: Record<string, string> = {}) => render(await ProfilePage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  state.store = amazon;
  state.profile = profile();
  state.asked = [];
});
afterEach(cleanup);

it('shows the reviewer, their counts and their reviews with the products', async () => {
  await show();
  expect(state.asked).toEqual([['US', ID, 1]]);
  expect(screen.getByRole('heading', { level: 1, name: 'Priya S' })).toBeInTheDocument();
  expect(screen.getByText('Reviews', { selector: 'dt' }).nextSibling).toHaveTextContent('2');
  expect(screen.getByText('Helpful votes', { selector: 'dt' }).nextSibling).toHaveTextContent('4');
  const first = screen.getByRole('article', { name: 'Title r1' });
  expect(within(first).getByRole('link', { name: 'Kettle' })).toHaveAttribute('href', '/product/k%201#reviews');
  expect(first).toHaveTextContent('Reviewed October 2, 2026 · Verified purchase · 3 people found this helpful');
  expect(screen.getByRole('article', { name: 'Title r2' })).toHaveTextContent('Reviewed October 2, 2026 · 1 person found this helpful');
  expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
});

it('pages through many reviews, in the India store', async () => {
  state.store = amazonIn;
  state.profile = profile({ total: 25, page: 2, pageCount: 3 });
  await show({ page: '2' });
  expect(state.asked).toEqual([['IN', ID, 2]]);
  const nav = screen.getByRole('navigation', { name: 'Pagination' });
  expect(within(nav).getByRole('link', { name: '1' })).toHaveAttribute('href', `/in/profile/${ID}`);
  expect(within(nav).getByRole('link', { name: '3' })).toHaveAttribute('href', `/in/profile/${ID}?page=3`);
  expect(within(screen.getByRole('article', { name: 'Title r1' })).getByRole('link', { name: 'Kettle' })).toHaveAttribute('href', '/in/product/k%201#reviews');
});

it('is not found without visible reviews', async () => {
  state.profile = null;
  await expect(show()).rejects.toThrow('NOT_FOUND');
});
