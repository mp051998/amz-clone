import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('@/app/actions/review', () => ({
  loadMoreReviews: async () => ({ ok: true, items: [] }),
  removeReview: async () => ({ ok: true }),
  reportReview: async () => ({ ok: true }),
  submitReview: async () => ({ ok: true }),
  toggleReviewHelpful: async () => ({ ok: true }),
}));

import { ReviewsPanel, type ReviewsPanelProps } from './ReviewsPanel';

const props = (over: Partial<ReviewsPanelProps> = {}): ReviewsPanelProps => ({
  productId: 'p1',
  summary: { rating: 0, count: 0, bars: [] } as unknown as ReviewsPanelProps['summary'],
  initial: [],
  total: 0,
  mine: null,
  signedIn: true,
  defaultName: 'Asha',
  signinHref: '/signin?next=/product/p1',
  locale: 'en-US',
  timeZone: 'UTC',
  insight: null,
  ...over,
});

const scrolled = vi.fn();
beforeEach(() => {
  scrolled.mockClear();
  Element.prototype.scrollIntoView = scrolled;
  window.history.replaceState(null, '', '/product/p1');
});
afterEach(cleanup);

const form = () => screen.queryByText('Review this product');

it('keeps the form closed on a plain visit', () => {
  render(<ReviewsPanel {...props()} />);
  expect(form()).toBeNull();
  expect(screen.getByRole('button', { name: 'Write a review' })).toHaveAttribute('aria-expanded', 'false');
});

it('opens the form, in view, when arriving at #write-review (from an order)', () => {
  window.history.replaceState(null, '', '/product/p1#write-review');
  render(<ReviewsPanel {...props()} />);
  expect(form()).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Write a review' })).toHaveAttribute('aria-expanded', 'true');
  expect(scrolled).toHaveBeenCalled();
});

it('opens when the hash changes to #write-review', () => {
  render(<ReviewsPanel {...props()} />);
  act(() => {
    window.history.replaceState(null, '', '/product/p1#write-review');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(form()).toBeInTheDocument();
});

it('a rating histogram row shows only that star’s reviews, and toggles back', () => {
  const review = (id: string, rating: number, title: string) => ({
    id, author: 'A', initial: 'A', rating, title, body: 'Body', createdAt: '2026-09-01T00:00:00Z',
    verified: true, helpful: 0, mine: false, votedHelpful: false, reported: false,
  });
  const bars = [5, 4, 3, 2, 1].map((star) => ({ star, count: star === 3 ? 0 : 1, pct: star === 3 ? 0 : 25 }));
  render(
    <ReviewsPanel
      {...props({
        summary: { rating: 3, count: 4, bars },
        initial: [review('a', 5, 'Love it'), review('b', 4, 'Pretty good'), review('c', 2, 'Meh'), review('d', 1, 'Broke')],
        total: 4,
      })}
    />,
  );
  const titles = () => screen.queryAllByRole('article').map((a) => a.querySelector('strong')!.textContent);
  expect(titles()).toEqual(['Love it', 'Pretty good', 'Meh', 'Broke']);

  const two = screen.getByRole('button', { name: '2 stars: 25% · show these reviews' });
  act(() => two.click());
  expect(two).toHaveAttribute('aria-pressed', 'true');
  expect(titles()).toEqual(['Meh']);
  expect(screen.getByRole('button', { name: /^2 star 1/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(/1 of 4 loaded reviews · 2 star/)).toBeInTheDocument();
  expect(scrolled).toHaveBeenCalled();

  // another row replaces it; picking it again clears it
  const five = screen.getByRole('button', { name: '5 stars: 25% · show these reviews' });
  act(() => five.click());
  expect(titles()).toEqual(['Love it']);
  act(() => five.click());
  expect(five).toHaveAttribute('aria-pressed', 'false');
  expect(titles()).toHaveLength(4);
  expect(screen.queryByRole('button', { name: /^5 star \d/ })).toBeNull();

  // nobody gave 3 stars
  expect(screen.getByRole('button', { name: '3 stars: 0% · show these reviews' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '1 star: 25% · show these reviews' })).toBeEnabled();
});

it('signed-out shoppers still get the sign-in link, not a form', () => {
  window.history.replaceState(null, '', '/product/p1#write-review');
  render(<ReviewsPanel {...props({ signedIn: false })} />);
  expect(form()).toBeNull();
  expect(screen.getByRole('link', { name: 'Sign in to write a review' })).toBeInTheDocument();
});
