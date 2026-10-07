import { expect, it } from 'vitest';
import { asksFit, fitSummary, isReviewFit } from './review-fit';

it('asks how it fits on clothing and shoes only', () => {
  expect(asksFit({ category: 'fashion' })).toBe(true);
  expect(asksFit({ category: 'home-kitchen' })).toBe(false);
  expect(['small', 'true_to_size', 'large', 'tiny', null].map(isReviewFit)).toEqual([true, true, true, false, false]);
});

it('shows the most given answer once 3 shoppers have said', () => {
  expect(fitSummary({ small: 1, true_to_size: 0, large: 1 })).toBeNull();
  expect(fitSummary({ small: 1, true_to_size: 5, large: 2 })).toEqual({
    counts: { small: 1, true_to_size: 5, large: 2 },
    total: 8,
    verdict: 'true_to_size',
    pct: { small: 13, true_to_size: 63, large: 25 },
  });
  expect(fitSummary({ small: 4, true_to_size: 2, large: 1 })?.verdict).toBe('small');
  expect(fitSummary({ small: 0, true_to_size: 1, large: 3 })?.verdict).toBe('large');
});

it('calls a tie true to size, else runs small', () => {
  expect(fitSummary({ small: 2, true_to_size: 2, large: 2 })?.verdict).toBe('true_to_size');
  expect(fitSummary({ small: 2, true_to_size: 0, large: 2 })?.verdict).toBe('small');
});
