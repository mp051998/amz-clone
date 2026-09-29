import { describe, expect, it } from 'vitest';
import type { Review } from '@/lib/types';
import { applyFilters, buildFilters, chipCount, reviewThemes, themeWords } from './reviewFilters';
import { nextRecent, RECENT_MAX } from './RecordView';

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

  it('tags reviews with the themes they mention', () => {
    expect(reviewThemes(reviews[1], ['Value for money', 'Comfort'])).toEqual(['Value for money']);
  });
});

describe('recently viewed cookie', () => {
  it('puts the product first, dedupes and caps', () => {
    expect(nextRecent('a,b,c', 'b')).toEqual(['b', 'a', 'c']);
    expect(nextRecent(null, 'x')).toEqual(['x']);
    const many = Array.from({ length: 20 }, (_, i) => `p${i}`).join(',');
    expect(nextRecent(many, 'new')).toHaveLength(RECENT_MAX);
  });
});
