import { describe, expect, it } from 'vitest';
import type { Review } from '@/lib/types';
import { applyFilters, buildFilters, chipCount, facetCount, reviewThemes, serverLabels, starsLabel, themeWords, toggleStars } from './reviewFilters';

const r = (id: string, rating: number, body: string, verified = true): Review => ({
  id, author: 'A', initial: 'A', rating, title: '', body, createdAt: '2026-09-01T00:00:00Z',
  verified, helpful: 0, mine: false, votedHelpful: false, reported: false,
});

const reviews = [
  r('1', 5, 'Battery lasts all week'),
  r('2', 2, 'Too expensive for what it is', false),
  r('3', 4, 'Comfortable fit, charging is quick'),
  r('4', 1, 'Broke after a week'),
];

describe('review filters', () => {
  it('maps themes to review words', () => {
    expect(themeWords('Battery life')).toEqual(['battery', 'charge', 'charging']);
    expect(themeWords('Value for money')).toContain('price');
  });

  it('keeps only theme chips that match a loaded review', () => {
    const ids = buildFilters(reviews, ['Battery life', 'Noise cancellation', 'battery life']).map((f) => f.id);
    expect(ids).toEqual(['theme:battery life']);
  });

  it('ANDs active theme chips and counts each against the others', () => {
    const f = buildFilters(reviews, ['Battery life', 'Value for money']);
    expect(applyFilters(reviews, f, ['theme:battery life']).map((x) => x.id)).toEqual(['1', '3']);
    expect(applyFilters(reviews, f, ['theme:battery life', 'theme:value for money'])).toEqual([]);
    expect(chipCount(reviews, f, [], 'theme:value for money')).toBe(1);
    expect(chipCount(reviews, f, ['theme:battery life'], 'theme:value for money')).toBe(0);
    expect(chipCount(reviews, f, [], 'theme:nope')).toBe(0);
  });

  it('names and toggles the star filters the database applies', () => {
    expect(starsLabel('positive')).toBe('Positive');
    expect(starsLabel(2)).toBe('2 star');
    expect(serverLabels({ stars: 'critical', verified: true })).toEqual(['Critical', 'Verified purchase']);
    expect(serverLabels({})).toEqual([]);
    expect(toggleStars({ verified: true }, 5)).toEqual({ verified: true, stars: 5 });
    expect(toggleStars({ stars: 5, verified: true }, 'critical')).toEqual({ verified: true, stars: 'critical' });
    expect(toggleStars({ stars: 5, verified: true }, 5)).toEqual({ verified: true });
  });

  it('counts a filter from the facets', () => {
    const facets = { 5: { all: 20, verified: 15 }, 4: { all: 5, verified: 1 }, 3: { all: 3, verified: 0 }, 2: { all: 2, verified: 2 }, 1: { all: 10, verified: 4 } };
    expect(facetCount(facets, {})).toBe(40);
    expect(facetCount(facets, { stars: 'positive' })).toBe(25);
    expect(facetCount(facets, { stars: 'critical', verified: true })).toBe(6);
    expect(facetCount(facets, { stars: 3 })).toBe(3);
  });

  it('tags reviews with the themes they mention', () => {
    expect(reviewThemes(reviews[1], ['Value for money', 'Comfort'])).toEqual(['Value for money']);
  });
});
