import { describe, expect, it } from 'vitest';
import { claimedPct, clock, dealOffPct, earlyAccessAt, inEarlyAccess, pickDeal } from './lightning';
import type { LightningDeal } from './types';

const deal = (over: Partial<LightningDeal>): LightningDeal => ({
  id: 'd',
  productId: 'p',
  market: 'US',
  dealPriceMinor: 700,
  quota: 30,
  claimed: 0,
  startsAt: '2026-10-08T10:00:00Z',
  endsAt: '2026-10-08T16:00:00Z',
  earlyAccessAt: '2026-10-08T09:30:00Z',
  state: 'live',
  ...over,
});

describe('lightning deals', () => {
  it('rounds the claimed share down and stops at 100', () => {
    expect(claimedPct({ claimed: 0, quota: 30 })).toBe(0);
    expect(claimedPct({ claimed: 14, quota: 30 })).toBe(46);
    expect(claimedPct({ claimed: 31, quota: 30 })).toBe(100);
  });

  it('counts down as h:mm:ss', () => {
    expect(clock(2 * 3_600_000 + 13 * 60_000 + 45_000)).toBe('2:13:45');
    expect(clock(249_999)).toBe('0:04:09');
    expect(clock(-5)).toBe('0:00:00');
    expect(clock(13 * 3_600_000)).toBe('13:00:00');
  });

  it('gives the saving as a whole percent', () => {
    expect(dealOffPct(4949, 3464)).toBe(30);
    expect(dealOffPct(1000, 1000)).toBe(0);
  });

  it('shows a live deal before a sold-out one, and the next upcoming one last', () => {
    const later = deal({ id: 'later', state: 'upcoming', startsAt: '2026-10-09T10:00:00Z' });
    const next = deal({ id: 'next', state: 'upcoming', startsAt: '2026-10-08T20:00:00Z' });
    expect(pickDeal([later, next])?.id).toBe('next');
    expect(pickDeal([later, deal({ id: 'gone', state: 'sold_out' })])?.id).toBe('gone');
    expect(pickDeal([next, deal({ id: 'now' })])?.id).toBe('now');
    expect(pickDeal([])).toBeUndefined();
  });

  it('opens an upcoming deal to members half an hour before its start, while units are left', () => {
    expect(earlyAccessAt('2026-10-08T10:00:00Z')).toBe('2026-10-08T09:30:00.000Z');
    const soon = deal({ state: 'upcoming' });
    const at = (iso: string) => Date.parse(iso);
    expect(inEarlyAccess(soon, at('2026-10-08T09:29:59Z'))).toBe(false);
    expect(inEarlyAccess(soon, at('2026-10-08T09:30:00Z'))).toBe(true);
    // still until the store's run puts it live
    expect(inEarlyAccess(soon, at('2026-10-08T10:00:30Z'))).toBe(true);
    expect(inEarlyAccess(deal({ state: 'upcoming', claimed: 30 }), at('2026-10-08T09:45:00Z'))).toBe(false);
    expect(inEarlyAccess(deal({}), at('2026-10-08T09:45:00Z'))).toBe(false);
    expect(inEarlyAccess(deal({ state: 'sold_out' }), at('2026-10-08T09:45:00Z'))).toBe(false);
  });
});
