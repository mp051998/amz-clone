import { describe, expect, it } from 'vitest';
import type { Subscription } from './types';
import { deliveries, frequencyLabel, issueText, snsPct, snsPriceMinor, snsShortfall, snsUnitMinor, storeDay } from './subscribe-save';

const sub = (o: Partial<Subscription> = {}): Subscription => ({
  id: 's1',
  market: 'US',
  productId: 'p1',
  qty: 1,
  everyMonths: 1,
  nextOn: '2026-11-09',
  addressId: 'a1',
  paymentMethod: 'giftcard',
  status: 'active',
  createdAt: '2026-10-09T00:00:00Z',
  ...o,
});

describe('subscribe & save', () => {
  it('says how often', () => {
    expect(frequencyLabel(1)).toBe('Every month');
    expect(frequencyLabel(3)).toBe('Every 3 months');
  });

  it('takes 5% off, 15% from five subscriptions in a delivery', () => {
    expect(snsPct(1)).toBe(5);
    expect(snsPct(4)).toBe(5);
    expect(snsPct(5)).toBe(15);
    expect(snsPct(9)).toBe(15);
  });

  it('rounds the discount down, as the database does', () => {
    expect(snsUnitMinor(5899, 5)).toBe(294);
    expect(snsUnitMinor(5899, 15)).toBe(884);
    expect(snsPriceMinor(5899)).toBe(5605);
  });

  it('groups active subscriptions into deliveries by day, address and payment, soonest first', () => {
    const subs = [
      sub({ id: 'a', nextOn: '2026-12-01' }),
      sub({ id: 'b', nextOn: '2026-11-09' }),
      sub({ id: 'c', nextOn: '2026-11-09', addressId: 'a2' }),
      sub({ id: 'd', nextOn: '2026-11-09' }),
      sub({ id: 'e', nextOn: '2026-11-09', status: 'cancelled' }),
    ];
    expect(deliveries(subs).map((d) => [d.on, d.addressId, d.subscriptions.map((s) => s.id), d.pct])).toEqual([
      ['2026-11-09', 'a1', ['b', 'd'], 5],
      ['2026-11-09', 'a2', ['c'], 5],
      ['2026-12-01', 'a1', ['a'], 5],
    ]);
  });

  it('gives a delivery of five the bigger discount, and says how far one is from it', () => {
    const five = deliveries(['a', 'b', 'c', 'd', 'e'].map((id) => sub({ id, productId: id })));
    expect(five).toHaveLength(1);
    expect(five[0].pct).toBe(15);
    expect(snsShortfall(five[0])).toBe(0);
    expect(snsShortfall({ subscriptions: [sub()] })).toBe(4);
  });

  it('keeps a subscription whose address was deleted in a delivery of its own', () => {
    const d = deliveries([sub({ id: 'a', addressId: undefined }), sub({ id: 'b' })]);
    expect(d.map((x) => x.addressId)).toEqual([undefined, 'a1']);
  });

  it('dates a delivery on its day in both stores', () => {
    const at = storeDay('2026-11-09');
    for (const timeZone of ['America/Los_Angeles', 'Asia/Kolkata']) {
      expect(new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone }).format(at)).toBe('9');
    }
  });

  it('explains every issue', () => {
    for (const k of ['out_of_stock', 'unavailable', 'address', 'payment'] as const) expect(issueText(k)).toMatch(/skipped/);
  });
});
