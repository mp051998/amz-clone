import { describe, expect, it } from 'vitest';
import { latestRelease, releaseOf } from './pre-order';
import { toOrder, toProduct } from './data/map';

const now = new Date('2026-10-07T12:00:00.000Z');

describe('releaseOf', () => {
  it('is the release while it is still to come', () => {
    expect(releaseOf({ releaseAt: '2026-11-20T05:00:00.000Z' }, now)).toBe('2026-11-20T05:00:00.000Z');
    expect(releaseOf({ releaseAt: '2026-10-01T05:00:00.000Z' }, now)).toBeNull();
    expect(releaseOf({}, now)).toBeNull();
  });
});

describe('latestRelease', () => {
  it('is the latest release still to come', () => {
    expect(
      latestRelease([{}, { releaseAt: '2026-11-20T05:00:00.000Z' }, { releaseAt: '2026-12-01T05:00:00.000Z' }, { releaseAt: '2026-10-01T05:00:00.000Z' }], now),
    ).toBe('2026-12-01T05:00:00.000Z');
    expect(latestRelease([{}, { releaseAt: '2026-10-01T05:00:00.000Z' }], now)).toBeNull();
    expect(latestRelease([], now)).toBeNull();
  });
});

describe('mapping', () => {
  it('reads a product’s and an order’s release, absent without one', () => {
    expect(toProduct({ id: 'a', release_at: '2026-11-20T08:00:00+00:00' }).releaseAt).toBe('2026-11-20T08:00:00+00:00');
    expect(toProduct({ id: 'a', release_at: null })).not.toHaveProperty('releaseAt');
    expect(toProduct({ id: 'a' })).not.toHaveProperty('releaseAt');
    const row = {
      id: 'ORD-1', market_id: 'US', currency: 'USD', status: 'placed', payment_method: 'card', payment_label: 'Visa',
      subtotal_minor: 5000, ship_minor: 0, tax_minor: 0, total_minor: 5000,
      ship_name: 'A', ship_phone: '1', ship_line1: '1 Main', ship_city: 'Austin', ship_state: 'TX', ship_postcode: '78701',
      created_at: '2026-10-01T10:00:00Z', items: [],
    } as unknown as Parameters<typeof toOrder>[0];
    expect(toOrder({ ...row, release_at: '2026-11-20T08:00:00+00:00' }).releaseAt).toBe('2026-11-20T08:00:00+00:00');
    expect(toOrder(row)).not.toHaveProperty('releaseAt');
  });
});
