import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { amazon } from '@/lib/amazon';
import type { SellerProfile } from '@/lib/data/seller-feedback';
import { averageStars, SellerRatings } from './SellerRatings';

afterEach(cleanup);

const period = (period: SellerProfile['periods'][number]['period'], positive: number, neutral: number, negative: number) => ({
  period,
  ratings: positive + neutral + negative,
  positive,
  neutral,
  negative,
});

const profile = (over: Partial<SellerProfile> = {}): SellerProfile => ({
  seller: 'Kettle Co',
  periods: [period('30d', 1, 0, 0), period('90d', 3, 1, 0), period('12m', 8, 1, 1), period('all', 9, 1, 2)],
  stars: { 1: 1, 2: 0, 3: 1, 4: 3, 5: 5 },
  recent: [{ rating: 2, arrivedOnTime: false, asDescribed: true, comment: 'Took two weeks.', createdAt: '2026-09-20T12:00:00Z' }],
  ...over,
});

describe('averageStars', () => {
  it('weighs each star by its count', () => {
    expect(averageStars({ 1: 1, 2: 0, 3: 1, 4: 3, 5: 5 })).toBe(4.1);
    expect(averageStars({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })).toBe(0);
  });
});

describe('SellerRatings', () => {
  it('leads with the 12-month share of positive ratings and the star bars', () => {
    render(<SellerRatings profile={profile()} store={amazon} />);
    expect(screen.getByText('80% positive in the last 12 months')).toBeInTheDocument();
    expect(screen.getByText('10 ratings')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '4.1 out of 5 stars' })).toBeInTheDocument();
    const bars = screen.getByRole('list', { name: 'Rating distribution, last 12 months' });
    expect(within(bars).getByLabelText('5 stars: 50%')).toBeInTheDocument();
    expect(within(bars).getByLabelText('2 stars: 0%')).toBeInTheDocument();
  });

  it('breaks ratings down by period', () => {
    render(<SellerRatings profile={profile()} store={amazon} />);
    const table = screen.getByRole('table', { name: 'Ratings by period' });
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['30 days', '90 days', '12 months', 'Lifetime']);
    const row = (name: string) => within(table).getByRole('rowheader', { name }).parentElement!;
    expect(row('Positive')).toHaveTextContent('100%75%80%75%');
    expect(row('Negative')).toHaveTextContent('0%0%10%17%');
    expect(row('Count')).toHaveTextContent('141012');
  });

  it('shows the latest comments without names', () => {
    render(<SellerRatings profile={profile()} store={amazon} />);
    expect(screen.getByText('Took two weeks.')).toBeInTheDocument();
    expect(screen.getByText('September 20, 2026 · Verified order')).toBeInTheDocument();
    expect(screen.getByText('Arrived late · As described')).toBeInTheDocument();
  });

  it('says when there is nothing to show yet', () => {
    const none = profile({ periods: [period('30d', 0, 0, 0), period('90d', 0, 0, 0), period('12m', 0, 0, 0), period('all', 0, 0, 0)], stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, recent: [] });
    render(<SellerRatings profile={none} store={amazon} />);
    expect(screen.getByText(/No ratings yet\./)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    cleanup();
    render(<SellerRatings profile={{ ...none, periods: [...none.periods.slice(0, 3), period('all', 2, 0, 0)] }} store={amazon} />);
    expect(screen.getByText(/No ratings in the last 12 months\./)).toBeInTheDocument();
  });
});
