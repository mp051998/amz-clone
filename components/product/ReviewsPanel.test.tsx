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

it('signed-out shoppers still get the sign-in link, not a form', () => {
  window.history.replaceState(null, '', '/product/p1#write-review');
  render(<ReviewsPanel {...props({ signedIn: false })} />);
  expect(form()).toBeNull();
  expect(screen.getByRole('link', { name: 'Sign in to write a review' })).toBeInTheDocument();
});
