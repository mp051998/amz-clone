import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { getPickupPoint, listPickupPoints, pickupBy } from './pickup';

const rows = [
  { id: 'US-SEA-BROADWAY', market_id: 'US', kind: 'counter', name: 'Hub Counter – Broadway Market', line1: '401 Broadway E', city: 'Seattle', state: 'WA', postcode: '98102', hours: 'Daily 9 AM–9 PM', hold_days: 14, active: true },
  { id: 'US-SEA-JUNIPER', market_id: 'US', kind: 'locker', name: 'Hub Locker – Juniper', line1: '2121 7th Ave', city: 'Seattle', state: 'WA', postcode: '98121', hours: 'Open 24 hours', hold_days: 3, active: true },
];

/** A client whose pickup_points read answers `reply`, recording the filters. */
function fakeDb(reply: { data: unknown; error: unknown }) {
  const filters: [string, unknown][] = [];
  const chain = {
    select: () => chain,
    eq: (col: string, v: unknown) => (filters.push([col, v]), chain),
    order: () => chain,
    maybeSingle: async () => reply,
    then: (resolve: (r: unknown) => unknown) => resolve(reply),
  };
  return { db: { from: () => chain } as unknown as Db, filters };
}

it('lists the store’s open points, and finds them by name, street, city or postcode', async () => {
  const { db, filters } = fakeDb({ data: rows, error: null });
  const all = await listPickupPoints(db, 'US');
  expect(filters).toEqual([['market_id', 'US'], ['active', true]]);
  expect(all.map((p) => p.id)).toEqual(['US-SEA-BROADWAY', 'US-SEA-JUNIPER']);
  expect(all[1]).toEqual({ id: 'US-SEA-JUNIPER', kind: 'locker', name: 'Hub Locker – Juniper', line1: '2121 7th Ave', city: 'Seattle', state: 'WA', postcode: '98121', hours: 'Open 24 hours', holdDays: 3 });
  expect((await listPickupPoints(db, 'US', ' juniper ')).map((p) => p.id)).toEqual(['US-SEA-JUNIPER']);
  expect((await listPickupPoints(db, 'US', '98102')).map((p) => p.id)).toEqual(['US-SEA-BROADWAY']);
  expect(await listPickupPoints(db, 'US', 'Boston')).toEqual([]);
});

it('lists none before the migration', async () => {
  expect(await listPickupPoints(fakeDb({ data: null, error: { code: '42P01', message: 'relation does not exist' } }).db, 'US')).toEqual([]);
});

it('reads one point, or null', async () => {
  expect((await getPickupPoint(fakeDb({ data: rows[0], error: null }).db, 'US', 'US-SEA-BROADWAY'))?.kind).toBe('counter');
  expect(await getPickupPoint(fakeDb({ data: null, error: null }).db, 'US', 'nope')).toBeNull();
});

it('holds an order for the point’s hold days from when it’s ready', () => {
  expect(pickupBy('2026-10-08T18:30:00.000Z', 3).toISOString()).toBe('2026-10-11T18:30:00.000Z');
});
