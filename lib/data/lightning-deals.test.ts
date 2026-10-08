import { describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { lightningDeals, lightningDealsFor } from './lightning-deals';

const NOW = new Date('2026-10-08T12:00:00Z');

const row = (over: Record<string, unknown>) => ({
  id: 'd1',
  product_id: 'p1',
  market_id: 'US',
  deal_price_minor: 3464,
  quota: 30,
  claimed: 4,
  starts_at: '2026-10-08T10:00:00Z',
  ends_at: '2026-10-08T16:00:00Z',
  started_at: '2026-10-08T10:00:03Z',
  was_price_minor: 4949,
  was_list_minor: null,
  was_deal_pct: null,
  was_deal: false,
  ended_at: null,
  end_reason: null,
  created_at: '2026-10-08T08:13:00Z',
  ...over,
});

/** A client whose read answers with `reply`, recording each filter. */
function fakeDb(reply: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const q: Record<string, unknown> = {
    then: (ok: (r: unknown) => unknown) => Promise.resolve(reply).then(ok),
  };
  for (const m of ['select', 'in', 'gt', 'lt', 'or', 'eq', 'is', 'order']) q[m] = (...args: unknown[]) => (calls.push([m, ...args]), q);
  const db = { from: (t: string) => (calls.push(['from', t]), q) };
  return { db: db as unknown as Db, calls };
}

describe('lightning deals', () => {
  it('give each product its deal now or next, leaving out those with none', async () => {
    const f = fakeDb({
      data: [
        row({ id: 'next', product_id: 'p1', started_at: null, was_price_minor: null, starts_at: '2026-10-08T18:00:00Z', ends_at: '2026-10-09T00:00:00Z' }),
        row({ id: 'live', product_id: 'p1', starts_at: '2026-10-08T10:00:00Z' }),
        row({ id: 'gone', product_id: 'p2', ended_at: '2026-10-08T11:00:00Z', end_reason: 'sold_out', claimed: 30 }),
        row({ id: 'off', product_id: 'p3', ended_at: '2026-10-08T11:00:00Z', end_reason: 'repriced' }),
      ],
      error: null,
    });
    const deals = await lightningDealsFor(f.db, ['p1', 'p2', 'p3', 'p4'], NOW);
    expect([...deals.keys()]).toEqual(['p1', 'p2']);
    expect(deals.get('p1')).toEqual({
      id: 'live',
      productId: 'p1',
      market: 'US',
      dealPriceMinor: 3464,
      wasPriceMinor: 4949,
      quota: 30,
      claimed: 4,
      startsAt: '2026-10-08T10:00:00Z',
      endsAt: '2026-10-08T16:00:00Z',
      earlyAccessAt: '2026-10-08T09:30:00.000Z',
      state: 'live',
    });
    expect(deals.get('p2')?.state).toBe('sold_out');
    expect(f.calls).toEqual([
      ['from', 'lightning_deals'],
      ['select', '*'],
      ['in', 'product_id', ['p1', 'p2', 'p3', 'p4']],
      ['gt', 'ends_at', NOW.toISOString()],
      ['or', 'ended_at.is.null,end_reason.eq.sold_out'],
    ]);
  });

  it('read nothing for no products, and nothing when the read fails', async () => {
    const f = fakeDb({ data: null, error: { message: 'relation does not exist' } });
    expect((await lightningDealsFor(f.db, [], NOW)).size).toBe(0);
    expect(f.calls).toEqual([]);
    expect((await lightningDealsFor(f.db, ['p1'], NOW)).size).toBe(0);
    expect(await lightningDeals(f.db, 'US', { now: NOW })).toEqual({ live: [], upcoming: [] });
  });

  it('list a store’s live deals by end and its upcoming ones by start', async () => {
    const f = fakeDb({
      data: [
        row({ id: 'a', ends_at: '2026-10-08T16:00:00Z' }),
        row({ id: 'b', starts_at: '2026-10-08T11:00:00Z', ends_at: '2026-10-08T13:00:00Z' }),
        row({ id: 'c', started_at: null, was_price_minor: null, starts_at: '2026-10-08T14:00:00Z', ends_at: '2026-10-08T20:00:00Z' }),
      ],
      error: null,
    });
    const r = await lightningDeals(f.db, 'IN', { withinHours: 12, now: NOW });
    expect(r.live.map((d) => d.id)).toEqual(['b', 'a']);
    expect(r.upcoming.map((d) => d.id)).toEqual(['c']);
    expect(f.calls).toEqual([
      ['from', 'lightning_deals'],
      ['select', '*'],
      ['eq', 'market_id', 'IN'],
      ['is', 'ended_at', null],
      ['gt', 'ends_at', NOW.toISOString()],
      ['lt', 'starts_at', '2026-10-09T00:00:00.000Z'],
      ['order', 'starts_at'],
    ]);
  });
});
