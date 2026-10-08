import { describe, expect, it } from 'vitest';
import { claimableSellers, claimOpenUntil, isClaimReason, soldByStore } from './atoz';

const now = new Date('2026-10-08T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const item = (seller: string) => ({ seller }) as never;

describe('soldByStore', () => {
  it('is the store itself, however it is written', () => {
    for (const s of ['Amazon', 'Amazon.com', 'amazon.in', ' AMAZON.IN ']) expect(soldByStore(s)).toBe(true);
  });

  it('is not another seller, even one with Amazon in its name', () => {
    for (const s of ['Lumen Store', 'Amazon Basics Reseller', 'amazon.co.uk', 'Appario Retail']) expect(soldByStore(s)).toBe(false);
  });
});

describe('isClaimReason', () => {
  it('knows the two reasons', () => {
    expect(isClaimReason('not_received')).toBe(true);
    expect(isClaimReason('not_as_described')).toBe(true);
    for (const v of ['damaged', '', null, 1]) expect(isClaimReason(v)).toBe(false);
  });
});

describe('claimOpenUntil', () => {
  it('is 90 days after delivery while that has not passed', () => {
    expect(claimOpenUntil({ status: 'placed', deliveredAt: daysAgo(10) }, now)?.toISOString()).toBe(new Date(Date.parse(daysAgo(10)) + 90 * 86_400_000).toISOString());
    expect(claimOpenUntil({ status: 'placed', deliveredAt: daysAgo(90) }, now)).not.toBeNull();
  });

  it('is null before delivery, after the window and for an order that is not placed', () => {
    expect(claimOpenUntil({ status: 'placed', deliveredAt: undefined }, now)).toBeNull();
    expect(claimOpenUntil({ status: 'placed', deliveredAt: daysAgo(-1) }, now)).toBeNull();
    expect(claimOpenUntil({ status: 'placed', deliveredAt: daysAgo(91) }, now)).toBeNull();
    expect(claimOpenUntil({ status: 'cancelled', deliveredAt: daysAgo(3) }, now)).toBeNull();
  });
});

describe('claimableSellers', () => {
  const order = { status: 'placed' as const, deliveredAt: daysAgo(5), items: [item('Acme'), item('Amazon.in'), item('Acme'), item('Zed')] };

  it('lists each other seller once, leaving out the store', () => {
    expect(claimableSellers(order, [], now)).toEqual(['Acme', 'Zed']);
  });

  it('leaves out a seller with a claim, unless it was withdrawn', () => {
    expect(claimableSellers(order, [{ seller: 'Acme', status: 'under_review' }], now)).toEqual(['Zed']);
    expect(claimableSellers(order, [{ seller: 'Zed', status: 'denied' }, { seller: 'Acme', status: 'withdrawn' }], now)).toEqual(['Acme']);
  });

  it('is empty outside the window', () => {
    expect(claimableSellers({ ...order, deliveredAt: daysAgo(100) }, [], now)).toEqual([]);
    expect(claimableSellers({ ...order, deliveredAt: undefined }, [], now)).toEqual([]);
  });
});
