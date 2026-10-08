import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightningDeal } from '@/lib/types';
import { LightningDealInfo } from './LightningDeal';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
});

const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;
const deal = (over: Partial<LightningDeal> = {}): LightningDeal => ({
  id: 'd1',
  productId: 'p1',
  market: 'US',
  dealPriceMinor: 3464,
  wasPriceMinor: 4949,
  quota: 30,
  claimed: 0,
  startsAt: '2026-10-08T10:00:00Z',
  endsAt: '2026-10-08T14:13:45Z',
  state: 'live',
  ...over,
});

describe('LightningDealInfo', () => {
  it('counts a live deal down to its end, with no claimed bar until some is claimed', () => {
    render(<LightningDealInfo deal={deal()} money={money} />);
    expect(screen.getByText('Lightning Deal')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('Ends in 2:13:45');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows how much is claimed', () => {
    render(<LightningDealInfo deal={deal({ claimed: 14 })} money={money} />);
    expect(screen.getByRole('progressbar', { name: 'Deal claimed' }).getAttribute('aria-valuenow')).toBe('46');
    expect(screen.getByText('46% claimed')).toBeTruthy();
  });

  it('says when it has ended', () => {
    render(<LightningDealInfo deal={deal({ endsAt: '2026-10-08T11:59:00Z' })} money={money} />);
    expect(screen.getByRole('timer').textContent).toBe('This deal has ended');
  });

  it('gives an upcoming deal’s price and start', () => {
    render(<LightningDealInfo deal={deal({ state: 'upcoming', wasPriceMinor: undefined, startsAt: '2026-10-08T13:30:00Z', endsAt: '2026-10-08T19:30:00Z' })} money={money} />);
    expect(screen.getByText('Upcoming Lightning Deal')).toBeTruthy();
    expect(screen.getByText('$34.64')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('Starts in 1:30:00');
  });

  it('says a sold-out deal is sold out', () => {
    render(<LightningDealInfo deal={deal({ state: 'sold_out', claimed: 30 })} money={money} />);
    expect(screen.getByText('Lightning Deal sold out.')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
  });
});
