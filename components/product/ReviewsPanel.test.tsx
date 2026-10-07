import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({ calls: [] as unknown[][], items: [] as unknown[] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('@/app/actions/review', () => ({
  loadMoreReviews: async (...args: unknown[]) => {
    loads.calls.push(args);
    return { ok: true, items: loads.items, total: loads.items.length };
  },
  removeReview: async () => ({ ok: true }),
  reportReview: async () => ({ ok: true }),
  submitReview: async () => ({ ok: true }),
  toggleReviewHelpful: async () => ({ ok: true }),
}));

import { ReviewsPanel, type ReviewsPanelProps } from './ReviewsPanel';

type Facets = ReviewsPanelProps['facets'];
/** Facets from [all, verified] per star, 5★ first. */
const facetsOf = (...counts: [number, number][]): Facets => {
  const f = {} as Facets;
  counts.forEach(([all, verified], i) => (f[(5 - i) as 1 | 2 | 3 | 4 | 5] = { all, verified }));
  return f;
};
const none = facetsOf([0, 0], [0, 0], [0, 0], [0, 0], [0, 0]);

const review = (id: string, rating: number, title: string, over: Record<string, unknown> = {}) => ({
  id, author: 'A', initial: 'A', rating, title, body: 'Body', createdAt: '2026-09-01T00:00:00Z',
  verified: true, helpful: 0, mine: false, votedHelpful: false, reported: false, ...over,
});
const titles = () => screen.queryAllByRole('article').map((a) => a.querySelector('strong')!.textContent);

const props = (over: Partial<ReviewsPanelProps> = {}): ReviewsPanelProps => ({
  productId: 'p1',
  summary: { rating: 0, count: 0, bars: [] } as unknown as ReviewsPanelProps['summary'],
  initial: [],
  total: 0,
  mine: null,
  facets: none,
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
  loads.calls = [];
  loads.items = [];
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

it('a rating histogram row asks for only that star’s reviews, and toggles back', async () => {
  const all = [review('a', 5, 'Love it'), review('b', 4, 'Pretty good'), review('c', 2, 'Meh'), review('d', 1, 'Broke')];
  const bars = [5, 4, 3, 2, 1].map((star) => ({ star, count: 1, pct: star === 3 ? 20 : 20 }));
  render(
    <ReviewsPanel
      {...props({
        summary: { rating: 3, count: 5, bars },
        initial: all,
        total: 4,
        // a 3★ rating with no written review
        facets: facetsOf([1, 1], [1, 1], [0, 0], [12, 4], [1, 1]),
      })}
    />,
  );
  expect(titles()).toEqual(['Love it', 'Pretty good', 'Meh', 'Broke']);

  loads.items = [all[2]];
  const two = screen.getByRole('button', { name: '2 stars: 20% · show these reviews' });
  await act(async () => two.click());
  expect(loads.calls).toEqual([['p1', 0, 'top', 30, { stars: 2 }]]);
  expect(two).toHaveAttribute('aria-pressed', 'true');
  expect(titles()).toEqual(['Meh']);
  // the count is every 2★ review, not just the loaded ones
  expect(screen.getByRole('button', { name: /^2 star 12$/ })).toBeInTheDocument();
  expect(screen.getByText('Showing 1 of 1 review · 2 star, most helpful first')).toBeInTheDocument();
  expect(scrolled).toHaveBeenCalled();

  // another row replaces it; picking it again clears it
  loads.items = [all[0]];
  const five = screen.getByRole('button', { name: '5 stars: 20% · show these reviews' });
  await act(async () => five.click());
  expect(loads.calls[1]).toEqual(['p1', 0, 'top', 30, { stars: 5 }]);
  expect(titles()).toEqual(['Love it']);
  loads.items = all;
  await act(async () => five.click());
  expect(loads.calls[2]).toEqual(['p1', 0, 'top', 30, {}]);
  expect(five).toHaveAttribute('aria-pressed', 'false');
  expect(titles()).toHaveLength(4);
  expect(screen.queryByRole('button', { name: /^5 star \d/ })).toBeNull();

  // nobody wrote a 3★ review
  expect(screen.getByRole('button', { name: '3 stars: 20% · show these reviews' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '1 star: 20% · show these reviews' })).toBeEnabled();
});

it('counts chips over every review and combines stars with verified purchase', async () => {
  const initial = [review('a', 5, 'Love it'), review('b', 1, 'Broke', { verified: false })];
  render(<ReviewsPanel {...props({ initial, total: 40, facets: facetsOf([20, 15], [5, 1], [3, 0], [2, 2], [10, 4]) })} />);
  const chip = (name: RegExp) => screen.getByRole('button', { name });
  expect(chip(/^All 40$/)).toHaveAttribute('aria-pressed', 'true');
  expect(chip(/^Positive 25$/)).toBeInTheDocument();
  expect(chip(/^Critical 15$/)).toBeInTheDocument();
  expect(chip(/^Verified purchase 22$/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Load more reviews \(38 more\)/ })).toBeInTheDocument();

  loads.items = [initial[1]];
  await act(async () => chip(/^Critical 15$/).click());
  expect(loads.calls.at(-1)).toEqual(['p1', 0, 'top', 30, { stars: 'critical' }]);
  // the other chips count alongside critical
  expect(chip(/^Verified purchase 6$/)).toBeInTheDocument();
  expect(chip(/^Positive 25$/)).toHaveAttribute('aria-pressed', 'false');

  await act(async () => chip(/^Verified purchase 6$/).click());
  expect(loads.calls.at(-1)).toEqual(['p1', 0, 'top', 30, { stars: 'critical', verified: true }]);
  expect(chip(/^Critical 6$/)).toHaveAttribute('aria-pressed', 'true');
  expect(chip(/^Positive 16$/)).toBeInTheDocument();

  // positive replaces critical, keeping verified
  await act(async () => chip(/^Positive 16$/).click());
  expect(loads.calls.at(-1)).toEqual(['p1', 0, 'top', 30, { stars: 'positive', verified: true }]);

  // the mock's total is what it returned: one review, all loaded
  expect(screen.queryByRole('button', { name: /Load more reviews/ })).toBeNull();
  await act(async () => chip(/^All 40$/).click());
  expect(loads.calls.at(-1)).toEqual(['p1', 0, 'top', 30, {}]);
});

it('loads more of the filtered reviews after the ones showing', async () => {
  const mine = review('m', 2, 'My review', { mine: true });
  const initial = [mine, review('a', 1, 'Broke')];
  render(<ReviewsPanel {...props({ initial, total: 3, mine, facets: facetsOf([0, 0], [0, 0], [0, 0], [1, 1], [2, 2]) })} />);
  loads.items = [review('b', 1, 'Also broke')];
  await act(async () => screen.getByRole('button', { name: /Load more reviews \(1 more\)/ }).click());
  // the pinned review isn't one of the natural order's
  expect(loads.calls).toEqual([['p1', 1, 'top', 10, {}]]);
  expect(titles()).toEqual(['My review', 'Broke', 'Also broke']);
});

it('signed-out shoppers still get the sign-in link, not a form', () => {
  window.history.replaceState(null, '', '/product/p1#write-review');
  render(<ReviewsPanel {...props({ signedIn: false })} />);
  expect(form()).toBeNull();
  expect(screen.getByRole('link', { name: 'Sign in to write a review' })).toBeInTheDocument();
});

it('sorts reviews by most recent, reloading as many as were showing', async () => {
  const top = [
    review('a', 4, 'Most helpful', { createdAt: '2026-01-01T00:00:00Z', helpful: 9 }),
    review('b', 4, 'Newest', { createdAt: '2026-09-01T00:00:00Z' }),
  ];
  render(<ReviewsPanel {...props({ initial: top, total: 2, summary: { rating: 4, count: 2, bars: [] } as unknown as ReviewsPanelProps['summary'] })} />);
  expect(screen.getByText(/most helpful first/)).toBeInTheDocument();

  loads.items = [top[1], top[0]];
  await act(async () => {
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort reviews' }), { target: { value: 'recent' } });
  });
  expect(loads.calls).toEqual([['p1', 0, 'recent', 10, {}]]);
  expect(titles()).toEqual(['Newest', 'Most helpful']);
  expect(screen.getByText(/newest first/)).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Sort reviews' })).toHaveValue('recent');
});

it('no sort control for a single review', () => {
  render(<ReviewsPanel {...props({ total: 1 })} />);
  expect(screen.queryByRole('combobox', { name: 'Sort reviews' })).toBeNull();
});
