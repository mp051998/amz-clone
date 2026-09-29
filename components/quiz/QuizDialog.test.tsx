import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decodeProfile, encodeProfile } from './profileCookie';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
const buildProfileAction = vi.fn();
vi.mock('@/app/actions/ai', () => ({ buildProfileAction: (...a: unknown[]) => buildProfileAction(...a) }));

import { QuizButton } from './QuizDialog';

const profile = {
  weights: { sound: 2, battery: 4, comfort: 5, anc: 5, value: 2 },
  reasons: { anc: 'Cabin noise is the biggest issue on flights' },
  summary: 'You fly a lot, so quiet and comfort lead.',
  watch: '',
  source: 'rules' as const,
};

beforeEach(() => {
  push.mockReset();
  buildProfileAction.mockReset().mockResolvedValue(profile);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('walks the five steps, builds a profile and applies it as preset=ai weights on /in/s', async () => {
  vi.useFakeTimers();
  render(<QuizButton market="IN" category="electronics" baseQuery="k=headphones">Tune for me…</QuizButton>);
  fireEvent.click(screen.getByRole('button', { name: 'Tune for me…' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Flights & long trips' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled(); // single-choice step needs an answer
  fireEvent.click(screen.getByRole('radio', { name: '3+ hours' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('radio', { name: 'A balance of both' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  fireEvent.click(screen.getByRole('button', { name: 'See my priorities' }));

  expect(screen.getByText('Working out what matters to you…')).toBeInTheDocument();
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(buildProfileAction).toHaveBeenCalledWith('electronics', expect.objectContaining({ use: ['Flights & long trips'], duration: '3+ hours' }), null);
  expect(screen.getByText('You fly a lot, so quiet and comfort lead.')).toBeInTheDocument();
  expect(screen.getByText('Cabin noise is the biggest issue on flights')).toBeInTheDocument();
  expect(screen.getByText(/based on your answers/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Apply to results' }));
  expect(push).toHaveBeenCalledTimes(1);
  const url = new URL(push.mock.calls[0][0], 'http://x');
  expect(url.pathname).toBe('/in/s');
  expect(url.searchParams.get('k')).toBe('headphones');
  expect(url.searchParams.get('dept')).toBe('electronics');
  expect(url.searchParams.get('preset')).toBe('ai');
  expect(url.searchParams.get('w')).toBe('sound.2,battery.4,comfort.5,anc.5,value.2');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(decodeProfile(document.cookie.split('tuned_profile=')[1]?.split(';')[0])?.profile.summary).toBe(profile.summary);
});

it('asks for a category first when none is known, and Escape closes', () => {
  render(
    <QuizButton market="US" category={null} categories={[{ slug: 'electronics', name: 'Electronics' }, { slug: 'books', name: 'Books' }]}>
      Answer 5 questions
    </QuizButton>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Answer 5 questions' }));
  expect(screen.getByText('What are you shopping for?')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Electronics' })).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(screen.getByRole('radio', { name: 'Books' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('profile cookie round-trips and rejects junk', () => {
  const raw = encodeProfile({ category: 'electronics', profile, answers: { use: ['a'], duration: null, priceVsQuality: null, pain: [], note: '' } });
  expect(decodeProfile(raw)?.profile.weights.anc).toBe(5);
  expect(decodeProfile('%7Bnope')).toBeNull();
  expect(decodeProfile(encodeURIComponent(JSON.stringify({ category: 'x' })))).toBeNull();
});
