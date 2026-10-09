import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({ calls: [] as unknown[][], items: [] as unknown[], submitted: [] as unknown[][], uploads: 0 }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('@/app/actions/review', () => ({
  loadMoreReviews: async (...args: unknown[]) => {
    loads.calls.push(args);
    return { ok: true, items: loads.items, total: loads.items.length };
  },
  removeReview: async () => ({ ok: true }),
  reportReview: async () => ({ ok: true }),
  submitReview: async (...args: unknown[]) => {
    loads.submitted.push(args);
    return { ok: true };
  },
  uploadReviewPhoto: async (form: FormData) => {
    loads.uploads += 1;
    const name = (form.get('photo') as File).name;
    return { ok: true, photo: { path: `u1/${name}`, url: `https://cdn.test/u1/${name}` } };
  },
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
  verified: true, helpful: 0, mine: false, votedHelpful: false, reported: false, photos: [], ...over,
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
  loads.submitted = [];
  loads.uploads = 0;
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

it('shows customer images and the photos on each review, opening them full size', () => {
  const photo = (n: number) => ({ path: `u2/${n}.jpg`, url: `https://cdn.test/u2/${n}.jpg` });
  render(
    <ReviewsPanel
      {...props({
        initial: [review('r1', 5, 'Great kettle', { author: 'Ravi', photos: [photo(1), photo(2)] })],
        total: 1,
        customerImages: [{ ...photo(1), reviewId: 'r1', rating: 5, author: 'Ravi' }, { ...photo(2), reviewId: 'r1', rating: 5, author: 'Ravi' }],
      })}
    />,
  );
  const strip = screen.getByRole('region', { name: 'Customer images' });
  expect(strip.querySelectorAll('img')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Open photo 1 of 2, from Ravi’s 5-star review' })).toBeInTheDocument();

  const article = screen.getByRole('article');
  expect(article.querySelectorAll('img')[1]).toHaveAttribute('src', 'https://cdn.test/u2/2.jpg');
  fireEvent.click(screen.getByRole('button', { name: 'Open photo 2 of 2 from Ravi' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('has no customer images section when no review has photos', () => {
  render(<ReviewsPanel {...props({ initial: [review('r1', 5, 'Great kettle')], total: 1 })} />);
  expect(screen.queryByRole('region', { name: 'Customer images' })).not.toBeInTheDocument();
});

it('adds photos to a review as they are picked, and sends them in order', async () => {
  render(<ReviewsPanel {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Write a review' }));
  const input = screen.getByLabelText('Add photos');
  const file = (name: string, type = 'image/jpeg', size = 1000) => new File([new Uint8Array(size)], name, { type });

  // the wrong kind of file never uploads
  fireEvent.change(input, { target: { files: [file('notes.pdf', 'application/pdf')] } });
  expect(screen.getByRole('alert')).toHaveTextContent('Use a JPEG, PNG or WebP photo.');
  expect(loads.uploads).toBe(0);

  await act(async () => {
    fireEvent.change(input, { target: { files: [file('a.jpg'), file('b.png', 'image/png')] } });
  });
  expect(screen.getByAltText('Your photo 1')).toHaveAttribute('src', 'https://cdn.test/u1/a.jpg');
  expect(screen.getByAltText('Your photo 2')).toHaveAttribute('src', 'https://cdn.test/u1/b.png');

  // too many at once: 3 more is the most that fits
  fireEvent.change(input, { target: { files: [file('c.jpg'), file('d.jpg'), file('e.jpg'), file('f.jpg')] } });
  expect(screen.getByRole('alert')).toHaveTextContent('You can add 3 more photos (up to 5).');
  expect(loads.uploads).toBe(2);

  fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
  expect(screen.queryByAltText('Your photo 2')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
  fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Lovely' } });
  fireEvent.change(screen.getByLabelText('Your review'), { target: { value: 'Boils fast.' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
  });
  expect(loads.submitted).toEqual([['p1', expect.objectContaining({ rating: 5, photos: ['u1/b.png'] })]]);
});

it('narrows to reviews with photos, counting alongside the other filters', async () => {
  const initial = [review('a', 5, 'Love it'), review('b', 1, 'Broke', { verified: false })];
  const facets = facetsOf([20, 15], [5, 1], [3, 0], [2, 2], [10, 4]);
  facets[5] = { ...facets[5], photos: 6, verifiedPhotos: 4 };
  facets[1] = { ...facets[1], photos: 2, verifiedPhotos: 0 };
  render(<ReviewsPanel {...props({ initial, total: 40, facets })} />);
  const chip = (name: RegExp) => screen.getByRole('button', { name });
  expect(chip(/^With photos 8$/)).toHaveAttribute('aria-pressed', 'false');

  loads.items = [initial[0]];
  await act(async () => chip(/^With photos 8$/).click());
  expect(loads.calls.at(-1)).toEqual(['p1', 0, 'top', 30, { photos: true }]);
  expect(chip(/^Verified purchase 4$/)).toBeInTheDocument();
  expect(chip(/^Critical 2$/)).toBeInTheDocument();
  expect(screen.getByText(/With photos, most helpful first/)).toBeInTheDocument();

  await act(async () => chip(/^With photos 8$/).click());
  expect(loads.calls.at(-1)).toEqual(['p1', 0, 'top', 30, {}]);
});

it('has no photos chip when no review has photos', () => {
  render(<ReviewsPanel {...props({ initial: [review('a', 5, 'Love it')], total: 1, facets: facetsOf([1, 1], [0, 0], [0, 0], [0, 0], [0, 0]) })} />);
  expect(screen.queryByRole('button', { name: /^With photos/ })).toBeNull();
});

it('searches the reviews, keeping the other filters, and bolds what it found', async () => {
  const initial = [review('a', 5, 'Love it'), review('b', 1, 'Broke', { verified: false })];
  const { container } = render(<ReviewsPanel {...props({ initial, total: 40, facets: facetsOf([20, 15], [5, 1], [3, 0], [2, 2], [10, 4]) })} />);
  const chip = (name: RegExp) => screen.getByRole('button', { name });
  const box = screen.getByLabelText('Search customer reviews');
  const search = () => act(async () => fireEvent.submit(box.closest('form')!));

  loads.items = [initial[1]];
  await act(async () => chip(/^Critical 15$/).click());

  loads.items = [review('c', 2, 'Battery died', { body: 'The battery lasts a day. BATTERY!' })];
  fireEvent.change(box, { target: { value: '  battery ' } });
  await search();
  expect(loads.calls.at(-1)).toEqual(['p1', 0, 'top', 30, { stars: 'critical', q: 'battery' }]);
  expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Battery', 'battery', 'BATTERY']);
  expect(screen.getByText(/“battery” \+ Critical, most helpful first/)).toBeInTheDocument();
  // facets can't count words, so the chips lose their counts while searching
  expect(chip(/^Critical$/)).toHaveAttribute('aria-pressed', 'true');
  expect(chip(/^All$/)).toBeInTheDocument();

  // the same search again, or one too short, asks for nothing
  const asked = loads.calls.length;
  await search();
  fireEvent.change(box, { target: { value: 'b' } });
  await search();
  expect(loads.calls).toHaveLength(asked);

  loads.items = [initial[1]];
  await act(async () => chip(/^Clear search$/).click());
  expect(loads.calls.at(-1)).toEqual(['p1', 0, 'top', 30, { stars: 'critical' }]);
  expect(box).toHaveValue('');
  expect(chip(/^Critical 15$/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
});

it('says when no review mentions the search', async () => {
  render(<ReviewsPanel {...props({ initial: [review('a', 5, 'Love it')], total: 1, facets: facetsOf([1, 1], [0, 0], [0, 0], [0, 0], [0, 0]) })} />);
  const box = screen.getByLabelText('Search customer reviews');
  fireEvent.change(box, { target: { value: 'zipper' } });
  await act(async () => fireEvent.submit(box.closest('form')!));
  expect(loads.calls.at(-1)).toEqual(['p1', 0, 'top', 30, { q: 'zipper' }]);
  expect(screen.getByText(/No reviews mention “zipper”\./)).toBeInTheDocument();

  loads.items = [review('a', 5, 'Love it')];
  await act(async () => screen.getByRole('button', { name: 'Clear filters' }).click());
  expect(loads.calls.at(-1)).toEqual(['p1', 0, 'top', 30, {}]);
  expect(box).toHaveValue('');
});

it('has no review search before there are written reviews', () => {
  render(<ReviewsPanel {...props()} />);
  expect(screen.queryByRole('search')).toBeNull();
});

it('links each reviewer’s name to their public profile', () => {
  const initial = [review('a', 5, 'Love it', { author: 'Priya S', authorId: 'u 1' }), review('b', 4, 'Fine', { author: 'Gone' })];
  render(<ReviewsPanel {...props({ initial, total: 2, profileBase: '/in/profile/' })} />);
  expect(screen.getByRole('link', { name: 'Priya S’s profile' })).toHaveAttribute('href', '/in/profile/u%201');
  expect(screen.queryByRole('link', { name: 'Gone’s profile' })).toBeNull();
  expect(screen.getByText('Gone')).toBeInTheDocument();
});

it('leaves names as plain text without a profile path', () => {
  render(<ReviewsPanel {...props({ initial: [review('a', 5, 'Love it', { author: 'Priya S', authorId: 'u1' })], total: 1 })} />);
  expect(screen.queryByRole('link', { name: 'Priya S’s profile' })).toBeNull();
  expect(screen.getByText('Priya S')).toBeInTheDocument();
});

it('labels a Vine review in place of a verified purchase, and says what Vine is', () => {
  const initial = [review('a', 5, 'Free and fab', { vine: true, verified: false }), review('b', 4, 'Bought it')];
  render(<ReviewsPanel {...props({ initial, total: 2 })} />);
  const [vine, bought] = screen.getAllByRole('article');
  expect(within(vine).getByText('Vine Customer Review of Free Product')).toBeInTheDocument();
  expect(within(vine).queryByText('Verified purchase')).toBeNull();
  expect(within(bought).queryByText('Vine Customer Review of Free Product')).toBeNull();
  expect(screen.getByText(/Vine reviewers get an item free to give their honest opinion/)).toBeInTheDocument();
});

it('says nothing about Vine when no review shown is one', () => {
  render(<ReviewsPanel {...props({ initial: [review('b', 4, 'Bought it')], total: 1 })} />);
  expect(screen.queryByText(/Vine/)).toBeNull();
});

it('asks how clothing fits, sending the answer (or null once cleared) with the review', async () => {
  render(<ReviewsPanel {...props({ askFit: true })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Write a review' }));
  const group = screen.getByRole('group', { name: /How does it fit\?/ });
  expect(group).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'Runs small' }));
  expect(screen.getByRole('radio', { name: 'Runs small' })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
  fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Snug' } });
  fireEvent.change(screen.getByLabelText('Your review'), { target: { value: 'Order a size up.' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit review' })));
  expect(loads.submitted).toEqual([['p1', expect.objectContaining({ rating: 4, fit: 'small' })]]);

  fireEvent.click(screen.getByRole('button', { name: 'Write a review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.getByRole('radio', { name: 'Runs small' })).not.toBeChecked();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit review' })));
  expect(loads.submitted[1]).toEqual(['p1', expect.objectContaining({ fit: null })]);
});

it('doesn’t ask how it fits on other products, or send a fit', async () => {
  render(<ReviewsPanel {...props({ mine: review('m', 5, 'Mine', { mine: true }) as never })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit your review' }));
  expect(screen.queryByRole('group', { name: /How does it fit\?/ })).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Update review' })));
  expect(loads.submitted[0][1]).not.toHaveProperty('fit');
});

it('shows how its reviews say it fits, and each reviewer’s answer', () => {
  render(
    <ReviewsPanel
      {...props({
        askFit: true,
        initial: [review('r1', 4, 'Snug', { fit: 'small' }), review('r2', 5, 'Spot on')] as never,
        total: 2,
        fit: { counts: { small: 1, true_to_size: 6, large: 1 }, total: 8, verdict: 'true_to_size', pct: { small: 13, true_to_size: 75, large: 13 } },
      })}
    />,
  );
  expect(screen.getByText('Fit: True to size')).toBeInTheDocument();
  expect(screen.getByText(/75% of 8 shoppers who said/)).toBeInTheDocument();
  const bars = screen.getByRole('list', { name: 'How it fits' });
  expect([...bars.querySelectorAll('li')].map((li) => li.getAttribute('aria-label'))).toEqual(['Runs small: 13%', 'True to size: 75%', 'Runs large: 13%']);
  const [snug, spot] = screen.getAllByRole('article');
  expect(snug).toHaveTextContent('Fit: Runs small');
  expect(spot).not.toHaveTextContent('Fit:');
});

it('has no fit summary until enough shoppers have said', () => {
  render(<ReviewsPanel {...props({ askFit: true })} />);
  expect(screen.queryByRole('list', { name: 'How it fits' })).not.toBeInTheDocument();
});

it('asks its category’s features, sending the ones rated (and leaving out a cleared one)', async () => {
  render(<ReviewsPanel {...props({ askFeatures: ['easy_to_use', 'easy_to_clean', 'value_for_money'] })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Write a review' }));
  const group = screen.getByRole('group', { name: /Rate features/ });
  expect(within(group).getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'))).toEqual(['Easy to use', 'Easy to clean', 'Value for money']);
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Easy to use' })).getByRole('radio', { name: '5 stars' }));
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Value for money' })).getByRole('radio', { name: '3 stars' }));
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Easy to clean' })).getByRole('radio', { name: '2 stars' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear Easy to clean' }));
  expect(within(screen.getByRole('radiogroup', { name: 'Easy to clean' })).getByRole('radio', { name: '2 stars' })).not.toBeChecked();
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Your rating' })).getByRole('radio', { name: '4 stars' }));
  fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Handy' } });
  fireEvent.change(screen.getByLabelText('Your review'), { target: { value: 'Does the job.' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit review' })));
  expect(loads.submitted).toEqual([['p1', expect.objectContaining({ rating: 4, features: { easy_to_use: 5, value_for_money: 3 } })]]);
});

it('starts from the features of your own review, and asks none on a book', async () => {
  const { unmount } = render(<ReviewsPanel {...props({ askFeatures: ['fun', 'durability'], mine: review('m', 5, 'Mine', { mine: true, features: { fun: 4 } }) as never })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit your review' }));
  expect(within(screen.getByRole('radiogroup', { name: 'Fun' })).getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Update review' })));
  expect(loads.submitted[0][1]).toMatchObject({ features: { fun: 4 } });
  unmount();

  render(<ReviewsPanel {...props({ mine: review('m', 5, 'Mine', { mine: true }) as never })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit your review' }));
  expect(screen.queryByRole('group', { name: /Rate features/ })).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Update review' })));
  expect(loads.submitted[1][1]).not.toHaveProperty('features');
});

it('shows each feature’s average by feature, and nothing until there are some', () => {
  render(
    <ReviewsPanel
      {...props({
        askFeatures: ['easy_to_use', 'value_for_money'],
        features: [
          { feature: 'easy_to_use', label: 'Easy to use', average: 4.6, count: 12 },
          { feature: 'value_for_money', label: 'Value for money', average: 4, count: 3 },
        ],
      })}
    />,
  );
  const rows = within(screen.getByRole('list', { name: 'Ratings by feature' })).getAllByRole('listitem');
  expect(rows.map((r) => r.textContent!.replace(/★/g, ''))).toEqual(['Easy to use4.6from 12 ratings', 'Value for money4.0from 3 ratings']);
  expect(within(rows[0]).getByRole('img', { name: '4.6 out of 5 stars' })).toBeInTheDocument();
  cleanup();

  render(<ReviewsPanel {...props({ askFeatures: ['easy_to_use'] })} />);
  expect(screen.queryByText('By feature')).not.toBeInTheDocument();
});

it('dates each review as Amazon does, in the store where it was written', () => {
  render(<ReviewsPanel {...props({ initial: [review('a', 5, 'Great')], total: 1, reviewedIn: 'the United States' })} />);
  expect(screen.getByRole('article')).toHaveTextContent('Reviewed in the United States on September 1, 2026');
  cleanup();

  render(<ReviewsPanel {...props({ initial: [review('a', 5, 'Great')], total: 1, locale: 'en-IN', timeZone: 'Asia/Kolkata', reviewedIn: 'India' })} />);
  expect(screen.getByRole('article')).toHaveTextContent('Reviewed in India on 1 September 2026');
  cleanup();

  render(<ReviewsPanel {...props({ initial: [review('a', 5, 'Great')], total: 1 })} />);
  expect(screen.getByRole('article')).toHaveTextContent('Reviewed on September 1, 2026');
});
