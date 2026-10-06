import { describe, expect, it } from 'vitest';
import { cancellableUntil, deliveryEta, isDelivered, orderStage, plannedSchedule, trackingSteps } from './tracking';

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

  it('plans the saved schedule the database fills', () => {
    expect(plannedSchedule('2026-09-26T08:09:00.000Z', 'Asia/Kolkata')).toEqual({
      shippedAt: '2026-09-26T18:09:00.000Z',
      outForDeliveryAt: '2026-09-27T03:30:00.000Z',
      deliveredAt: '2026-09-27T06:00:00.000Z',
    });
    // across the US fall-back (Nov 1): 9:00 PST is 17:00 UTC
    expect(plannedSchedule('2026-10-31T20:00:00.000Z', 'America/Los_Angeles').outForDeliveryAt).toBe('2026-11-01T17:00:00.000Z');
  });
});

describe('saved schedule', () => {
  const saved = {
    status: 'placed' as const,
    createdAt: placed,
    placedAt: placed,
    shippedAt: at(1).toISOString(),
    outForDeliveryAt: at(3).toISOString(),
    deliveredAt: at(4).toISOString(),
  };

  it('uses the saved times over the plan', () => {
    const s = trackingSteps(saved, at(2));
    expect(s.map((x) => x.at)).toEqual([placed, at(1).toISOString(), at(1).toISOString(), at(3).toISOString(), at(4).toISOString()]);
    expect(s.map((x) => x.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(deliveryEta(saved, at(2))).toBe(at(4).toISOString());
    expect(isDelivered(saved, at(4))).toBe(true);
  });

  it('derives the stage', () => {
    expect(orderStage(saved, at(0.5))).toBe('preparing');
    expect(orderStage(saved, at(1))).toBe('shipped');
    expect(orderStage(saved, at(3.5))).toBe('out_for_delivery');
    expect(orderStage(saved, at(4))).toBe('delivered');
    expect(orderStage({ ...saved, status: 'cancelled' }, at(0))).toBe('cancelled');
    expect(orderStage({ status: 'awaiting_payment', createdAt: placed }, at(0))).toBe('awaiting_payment');
    // no saved schedule: the plan
    expect(orderStage({ status: 'placed', createdAt: placed }, at(9))).toBe('preparing');
    expect(orderStage({ status: 'placed', createdAt: placed }, at(10))).toBe('shipped');
  });

  it('shoppers may cancel until the saved ship time', () => {
    expect(cancellableUntil(saved, at(0.5))).toBe(saved.shippedAt);
    expect(cancellableUntil(saved, at(1))).toBeNull();
    expect(cancellableUntil({ status: 'placed', createdAt: placed }, at(0))).toBeNull();
    expect(cancellableUntil({ ...saved, status: 'cancelled' }, at(0))).toBeNull();
  });

  it('a cancelled order shows when it was cancelled', () => {
    const s = trackingSteps({ status: 'cancelled', createdAt: placed, placedAt: placed, cancelledAt: at(5).toISOString() }, at(50));
    expect(s[1]).toMatchObject({ label: 'Cancelled', at: at(5).toISOString() });
  });
});
