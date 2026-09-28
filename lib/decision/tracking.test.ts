import { describe, expect, it } from 'vitest';
import { deliveryEta, isDelivered, trackingSteps } from './tracking';

const placed = '2026-09-01T00:00:00.000Z';
const at = (h: number) => new Date(Date.parse(placed) + h * 3_600_000);

describe('trackingSteps', () => {
  it('advances with time', () => {
    const early = trackingSteps({ status: 'placed', createdAt: placed }, at(1));
    expect(early.map((s) => s.state)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    const mid = trackingSteps({ status: 'placed', createdAt: placed }, at(12));
    expect(mid.map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    const late = trackingSteps({ status: 'placed', createdAt: placed }, at(48));
    expect(late[4]).toMatchObject({ label: 'Delivered', state: 'current' });
    expect(isDelivered({ status: 'placed', createdAt: placed }, at(48))).toBe(true);
    expect(isDelivered({ status: 'placed', createdAt: placed }, at(12))).toBe(false);
  });

  it('awaiting payment stays at the first step', () => {
    const s = trackingSteps({ status: 'awaiting_payment', createdAt: placed }, at(100));
    expect(s[0].state).toBe('current');
    expect(s.slice(1).every((x) => x.state === 'upcoming')).toBe(true);
  });

  it('cancelled orders show a Cancelled step and no ETA', () => {
    const s = trackingSteps({ status: 'cancelled', createdAt: placed }, at(5));
    expect(s.map((x) => x.label)).toEqual(['Order placed', 'Cancelled']);
    expect(deliveryEta({ status: 'cancelled', createdAt: placed })).toBeNull();
    expect(deliveryEta({ status: 'placed', createdAt: placed }, at(1))).toBe(at(35.5).toISOString());
  });

  it('snaps delivery to daytime in the store time zone', () => {
    // placed 13:39 IST → shipped 23:39 IST → out 09:00 IST next day, delivered 11:30 IST
    const ist = '2026-09-26T08:09:00.000Z';
    const s = trackingSteps({ status: 'placed', createdAt: ist }, new Date(ist), 'Asia/Kolkata');
    expect(s[3].at).toBe('2026-09-27T03:30:00.000Z');
    expect(s[4].at).toBe('2026-09-27T06:00:00.000Z');
    // late-evening US order skips a day so shipping has ≥ 6 h before the van leaves
    const ny = '2026-09-26T03:00:00.000Z'; // 23:00 EDT on the 25th; ships 09:00 EDT on the 26th
    expect(deliveryEta({ status: 'placed', createdAt: ny }, new Date(ny), 'America/New_York')).toBe('2026-09-27T15:30:00.000Z');
  });
});
