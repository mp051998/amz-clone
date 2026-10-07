import { expect, it } from 'vitest';
import { readReviewSearch, REVIEW_SEARCH_MAX } from './review-search';

it('reads a review search: trimmed, spaces collapsed, 2–100 characters', () => {
  expect(readReviewSearch('  battery   life ')).toBe('battery life');
  expect(readReviewSearch('ok')).toBe('ok');
  expect(readReviewSearch(' a ')).toBeNull();
  expect(readReviewSearch('')).toBeNull();
  expect(readReviewSearch(null)).toBeNull();
  expect(readReviewSearch(42)).toBeNull();
  expect(readReviewSearch('x'.repeat(150))).toHaveLength(REVIEW_SEARCH_MAX);
});
