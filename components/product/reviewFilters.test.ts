import { describe, expect, it } from 'vitest';
import type { Review } from '@/lib/types';
import { activeStar, applyFilters, buildFilters, chipCount, reviewThemes, themeWords } from './reviewFilters';

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
    const ids = buildFilters(reviews, ['Battery life', 'Noise cancellation']).map((f) => f.id);
    expect(ids).toEqual(['positive', 'critical', 'verified', 'theme:battery life']);
  });

  it('ANDs active filters and counts chips against the others', () => {
    const f = buildFilters(reviews, ['Battery life']);
    expect(applyFilters(reviews, f, ['positive']).map((x) => x.id)).toEqual(['1', '3']);
    expect(applyFilters(reviews, f, ['critical', 'verified']).map((x) => x.id)).toEqual(['4']);
    expect(chipCount(reviews, f, ['positive'], 'theme:battery life')).toBe(2);
    expect(chipCount(reviews, f, ['critical'], 'verified')).toBe(1);
  });

  it('adds the star picked in the histogram as the first chip, ANDed with the rest', () => {
    expect(activeStar(['verified', 'star:2'])).toBe(2);
    expect(activeStar(['star:9', 'positive'])).toBeNull();
    const f = buildFilters(reviews, [], 2);
    expect(f.map((x) => x.id)).toEqual(['star:2', 'positive', 'critical', 'verified']);
    expect(f[0].label).toBe('2 star');
    expect(applyFilters(reviews, f, ['star:2']).map((x) => x.id)).toEqual(['2']);
    expect(applyFilters(reviews, f, ['star:2', 'verified'])).toEqual([]);
    expect(chipCount(reviews, f, ['star:2'], 'verified')).toBe(0);
  });

  it('tags reviews with the themes they mention', () => {
    expect(reviewThemes(reviews[1], ['Value for money', 'Comfort'])).toEqual(['Value for money']);
  });
});
