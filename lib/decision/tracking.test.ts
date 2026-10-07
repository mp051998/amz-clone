import { describe, expect, it } from 'vitest';
import { cancellableUntil, deliveryDayAfter, deliveryEta, deliveryOptions, isDelivered, orderStage, plannedSchedule, trackingSteps } from './tracking';

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

describe('fast delivery', () => {
  const IST = 'Asia/Kolkata';

  it('ships in 3 h and goes out on the evening run: same day by noon, else the next day', () => {
    // placed 10:00 IST → shipped 13:00 → out 17:00, delivered 19:30 the same day
    expect(plannedSchedule('2026-10-07T04:30:00.000Z', IST, 'fast')).toEqual({
      shippedAt: '2026-10-07T07:30:00.000Z',
      outForDeliveryAt: '2026-10-07T11:30:00.000Z',
      deliveredAt: '2026-10-07T14:00:00.000Z',
    });
    // placed 13:00 IST → shipped 16:00, too late for today's 17:00 run
    expect(plannedSchedule('2026-10-07T07:30:00.000Z', IST, 'fast').deliveredAt).toBe('2026-10-08T14:00:00.000Z');
  });

  it('is offered only when it beats standard delivery', () => {
    // 10:00 IST: today 19:30 vs tomorrow 11:30
    expect(deliveryOptions(new Date('2026-10-07T04:30:00.000Z'), IST)).toEqual({
      standard: '2026-10-08T06:00:00.000Z',
      fast: '2026-10-07T14:00:00.000Z',
      fastBy: '2026-10-07T06:30:00.000Z', // order by noon IST
      day: null,
    });
    // 15:00 IST: tomorrow 19:30 would be later than tomorrow 11:30
    expect(deliveryOptions(new Date('2026-10-07T09:30:00.000Z'), IST)).toEqual({ standard: '2026-10-08T06:00:00.000Z', fast: null, fastBy: null, day: null });
    // 21:00 IST: tomorrow 19:30 vs the day after, 11:30
    expect(deliveryOptions(new Date('2026-10-07T15:30:00.000Z'), IST)).toEqual({
      standard: '2026-10-09T06:00:00.000Z',
      fast: '2026-10-08T14:00:00.000Z',
      fastBy: '2026-10-08T06:30:00.000Z', // tomorrow's noon still gets tomorrow's run
      day: null,
    });
  });

  it('an unpaid fast order shows the fast plan', () => {
    const now = new Date('2026-10-07T04:30:00.000Z');
    const steps = trackingSteps({ status: 'awaiting_payment', createdAt: now.toISOString(), shipSpeed: 'fast' }, now, IST);
    expect(steps.map((x) => x.at)).toEqual([
      '2026-10-07T04:30:00.000Z',
      '2026-10-07T06:30:00.000Z',
      '2026-10-07T07:30:00.000Z',
      '2026-10-07T11:30:00.000Z',
      '2026-10-07T14:00:00.000Z',
    ]);
  });
});

describe('Delivery Day', () => {
  const NY = 'America/New_York';
  // Wednesday Oct 7, 10:00 EDT: standard ships 20:00, arrives Thursday 11:30
  const wed = '2026-10-07T14:00:00.000Z';

  it('arrives on the first chosen weekday on or after standard delivery, shipping the evening before', () => {
    expect(plannedSchedule(wed, NY).deliveredAt).toBe('2026-10-08T15:30:00.000Z');
    // Friday: out 09:00, delivered 11:30, shipped 18:00 Thursday
    expect(plannedSchedule(wed, NY, 'day', 5)).toEqual({
      shippedAt: '2026-10-08T22:00:00.000Z',
      outForDeliveryAt: '2026-10-09T13:00:00.000Z',
      deliveredAt: '2026-10-09T15:30:00.000Z',
    });
    // Thursday is standard's own day: the same schedule as standard
    expect(plannedSchedule(wed, NY, 'day', 4)).toEqual(plannedSchedule(wed, NY));
    // Wednesday has passed: next week's
    expect(plannedSchedule(wed, NY, 'day', 3).deliveredAt).toBe('2026-10-14T15:30:00.000Z');
  });

  it('keeps local times across a clock change', () => {
    // Friday Oct 30, 10:00 EDT → standard Saturday; Monday Nov 2 is on EST
    expect(deliveryDayAfter(Date.parse('2026-10-30T14:00:00.000Z'), 1, NY)).toEqual({
      shipped: Date.parse('2026-11-01T23:00:00.000Z'), // 18:00 EST Sunday
      outForDelivery: Date.parse('2026-11-02T14:00:00.000Z'),
      delivered: Date.parse('2026-11-02T16:30:00.000Z'),
    });
  });

  it('checkout quotes the day only with one', () => {
    expect(deliveryOptions(new Date(wed), NY, 5)).toEqual({
      standard: '2026-10-08T15:30:00.000Z',
      fast: '2026-10-07T23:30:00.000Z',
      fastBy: '2026-10-07T16:00:00.000Z',
      day: '2026-10-09T15:30:00.000Z',
    });
    expect(deliveryOptions(new Date(wed), NY, null).day).toBeNull();
  });

  it('an unpaid Delivery Day order shows that plan', () => {
    const steps = trackingSteps({ status: 'awaiting_payment', createdAt: wed, shipSpeed: 'day', deliveryDay: 5 }, new Date(wed), NY);
    expect(steps.slice(2).map((x) => x.at)).toEqual(['2026-10-08T22:00:00.000Z', '2026-10-09T13:00:00.000Z', '2026-10-09T15:30:00.000Z']);
  });
});
