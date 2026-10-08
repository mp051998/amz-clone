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
  earlyAccessAt: '2026-10-08T09:30:00Z',
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

  const early = (member: boolean) => ({ membership: 'Plus', member, joinHref: '/prime' });
  // 12:00 now: starts in 20 minutes, so members can buy it already
  const opening = deal({ state: 'upcoming', wasPriceMinor: undefined, claimed: 9, startsAt: '2026-10-08T12:20:00Z', endsAt: '2026-10-08T18:20:00Z' });

  it('tells a member in its early access that they pay the deal price now', () => {
    render(<LightningDealInfo deal={opening} money={money} early={early(true)} />);
    expect(screen.getByText('Plus early access')).toBeTruthy();
    expect(screen.getByText('$34.64')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('Opens to everyone in 0:20:00');
    expect(screen.getByText('30% claimed')).toBeTruthy();
    expect(screen.queryByText(/Join Plus/)).toBeNull();
  });

  it('tells anyone else that members can buy it now, with a way to join', () => {
    render(<LightningDealInfo deal={opening} money={money} early={early(false)} />);
    expect(screen.getByText('Upcoming Lightning Deal')).toBeTruthy();
    expect(screen.getByText(/Plus members can buy it at this price now/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Join Plus' }).getAttribute('href')).toBe('/prime');
  });

  it('says members get a later deal half an hour early', () => {
    render(<LightningDealInfo deal={deal({ state: 'upcoming', startsAt: '2026-10-08T13:30:00Z', endsAt: '2026-10-08T19:30:00Z' })} money={money} early={early(true)} />);
    expect(screen.getByText('Upcoming Lightning Deal')).toBeTruthy();
    expect(screen.getByText('Plus members get it 30 minutes early.')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('Starts in 1:30:00');
  });
});
