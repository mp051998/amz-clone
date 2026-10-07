import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { Review } from '@/lib/types';
import { product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', name: 'Asha', email: 'asha@example.com' } as unknown,
  waiting: [] as unknown[],
  written: [] as unknown[],
  waitingFails: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/reviews', () => ({
  awaitingReview: async () => {
    if (state.waitingFails) throw new Error('boom');
    return state.waiting;
  },
  listMyReviews: async () => state.written,
}));
vi.mock('./actions', () => ({ deleteMyReview: async () => {} }));
vi.mock('@/app/actions/review', () => ({ uploadReviewPhoto: async () => ({ ok: false }) }));

import YourReviewsPage from './page';

const review = (over: Partial<Review> = {}): Review => ({
  id: 'r1',
  author: 'Asha',
  initial: 'A',
  rating: 4,
  title: 'Does the job',
  body: 'Boils fast and pours cleanly.',
  createdAt: '2026-10-02T12:00:00Z',
  verified: true,
  helpful: 3,
  mine: true,
  votedHelpful: false,
  reported: false, photos: [],
  ...over,
});

const show = async (sp: { done?: string; error?: string } = {}) => render(await YourReviewsPage({ searchParams: Promise.resolve(sp) }));

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.waiting = [];
  state.written = [];
  state.waitingFails = false;
});

it('sends the signed-out to sign in (India store paths too)', async () => {
  state.user = null;
  await expect(YourReviewsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT /signin?next=/account/reviews');
  state.store = amazonIn;
  await expect(YourReviewsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT /in/signin?next=/account/reviews');
});

it('says when there is nothing to review yet', async () => {
  await show();
  expect(screen.getByText('Nothing to review yet')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Your orders' })).toHaveAttribute('href', '/orders');
});

it('lists what’s waiting for a review, linking to the review form', async () => {
  state.waiting = [{ product: product({ id: 'k 1', title: 'Kettle' }), orderId: 'o1', deliveredAt: '2026-10-03T15:00:00Z' }];
  await show();
  const section = screen.getByRole('region', { name: 'Waiting for your review' });
  expect(within(section).getByText('1 item')).toBeInTheDocument();
  expect(within(section).getByText('Delivered October 3, 2026')).toBeInTheDocument();
  expect(within(section).getByRole('link', { name: 'Write a review: Kettle' })).toHaveAttribute('href', '/product/k%201#write-review');
  expect(screen.queryByText('Nothing to review yet')).toBeNull();
});

it('lists the reviews written, with edit, delete and a note on hidden ones', async () => {
  state.written = [
    { review: review(), product: product({ id: 'k', title: 'Kettle' }) },
    { review: review({ id: 'r2', title: 'Chipped', rating: 2, verified: false, helpful: 0, hidden: true }), product: product({ id: 'm', title: 'Mug' }) },
  ];
  await show();
  const section = screen.getByRole('region', { name: 'Reviews you’ve written' });
  expect(within(section).getByText('2 reviews')).toBeInTheDocument();
  expect(within(section).getByText('Reviewed October 2, 2026 · Verified purchase · 3 people found this helpful')).toBeInTheDocument();
  expect(within(section).getByRole('link', { name: 'Edit your review of Kettle' })).toHaveAttribute('href', '/product/k#write-review');
  expect(within(section).getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  expect(within(section).getAllByText('Hidden from shoppers after reports. Only you can see it.')).toHaveLength(1);
});

it('still shows the reviews written when the waiting list can’t load, and reports the outcome', async () => {
  state.waitingFails = true;
  state.written = [{ review: review(), product: product({ id: 'k', title: 'Kettle' }) }];
  await show({ done: 'deleted' });
  expect(screen.getByText('Review deleted.')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Reviews you’ve written' })).toBeInTheDocument();
  cleanup();
  await show({ error: 'review_not_found' });
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

it('shows the photos on a review, opening them full size', async () => {
  const photos = ['u1/a.jpg', 'u1/b.png'].map((path) => ({ path, url: `https://cdn.test/${path}` }));
  state.written = [{ review: review({ photos }), product: product({ id: 'k', title: 'Kettle' }) }, { review: review({ id: 'r2' }), product: product({ id: 'm', title: 'Mug' }) }];
  await show();
  const open = screen.getAllByRole('button', { name: /^Open photo/ });
  expect(open.map((b) => b.getAttribute('aria-label'))).toEqual(['Open photo 1 of 2 from your review of Kettle', 'Open photo 2 of 2 from your review of Kettle']);
  open[1].click();
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});
