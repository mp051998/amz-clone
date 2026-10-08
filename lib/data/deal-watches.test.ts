import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { myWatchedDeals } from './deal-watches';

type Reply = { data: unknown; error: unknown };

/** A client answering each table's read with its reply, recording the calls. */
function fakeDb(replies: Record<string, Reply>) {
  const ops: [string, unknown[]][] = [];
  const db = {
    from: (table: string) => {
      ops.push(['from', [table]]);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'eq', 'gt', 'or']) {
        q[m] = (...args: unknown[]) => {
          ops.push([m, args]);
          return q;
        };
      }
      q.then = (resolve: (r: Reply) => unknown) => resolve(replies[table]);
      return q;
    },
  };
  return { db: db as unknown as Db, ops };
}

const NOW = new Date('2026-10-08T12:00:00Z');
const row = (id: string, o: { started?: string | null; starts: string; ends: string; ended?: string; reason?: string }) => ({
  id,
  product_id: `p-${id}`,
  market_id: 'US',
  deal_price_minor: 3000,
  quota: 10,
  claimed: 2,
  starts_at: o.starts,
  ends_at: o.ends,
  started_at: o.started ?? null,
  was_price_minor: o.started ? 5000 : null,
  ended_at: o.ended ?? null,
  end_reason: o.reason ?? null,
});

it('lists watched deals that haven’t ended: live ending soonest, then upcoming starting soonest, then sold out', async () => {
  const { db, ops } = fakeDb({
    lightning_deal_watches: { data: [{ deal_id: 'a' }, { deal_id: 'b' }, { deal_id: 'c' }, { deal_id: 'd' }, { deal_id: 'e' }], error: null },
    lightning_deals: {
      data: [
        row('a', { starts: '2026-10-08T15:00:00Z', ends: '2026-10-08T21:00:00Z' }),
        row('b', { started: '2026-10-08T10:00:00Z', starts: '2026-10-08T10:00:00Z', ends: '2026-10-08T16:00:00Z' }),
        row('c', { started: '2026-10-08T09:00:00Z', starts: '2026-10-08T09:00:00Z', ends: '2026-10-08T15:00:00Z', ended: '2026-10-08T11:00:00Z', reason: 'sold_out' }),
        row('d', { starts: '2026-10-08T13:00:00Z', ends: '2026-10-08T19:00:00Z' }),
        row('e', { started: '2026-10-08T11:00:00Z', starts: '2026-10-08T11:00:00Z', ends: '2026-10-08T14:00:00Z' }),
      ],
      error: null,
    },
  });
  const deals = await myWatchedDeals(db, 'US', NOW);
  expect(deals.map((d) => [d.id, d.state])).toEqual([
    ['e', 'live'],
    ['b', 'live'],
    ['d', 'upcoming'],
    ['a', 'upcoming'],
    ['c', 'sold_out'],
  ]);
  expect(deals[0]).toMatchObject({ productId: 'p-e', dealPriceMinor: 3000, wasPriceMinor: 5000, endsAt: '2026-10-08T14:00:00Z' });
  expect(ops.slice(2)).toEqual([
    ['from', ['lightning_deals']],
    ['select', ['*']],
    ['in', ['id', ['a', 'b', 'c', 'd', 'e']]],
    ['eq', ['market_id', 'US']],
    ['gt', ['ends_at', NOW.toISOString()]],
    ['or', ['ended_at.is.null,end_reason.eq.sold_out']],
  ]);
});

it('leaves out a deal ended any other way', async () => {
  const { db } = fakeDb({
    lightning_deal_watches: { data: [{ deal_id: 'x' }], error: null },
    lightning_deals: { data: [row('x', { started: '2026-10-08T10:00:00Z', starts: '2026-10-08T10:00:00Z', ends: '2026-10-08T16:00:00Z', ended: '2026-10-08T11:00:00Z', reason: 'cancelled' })], error: null },
  });
  expect(await myWatchedDeals(db, 'US', NOW)).toEqual([]);
});

it('is empty with nothing watched, signed out, or on a failed read', async () => {
  const none = fakeDb({ lightning_deal_watches: { data: [], error: null }, lightning_deals: { data: [], error: null } });
  expect(await myWatchedDeals(none.db, 'US', NOW)).toEqual([]);
  expect(none.ops.some(([m, a]) => m === 'from' && a[0] === 'lightning_deals')).toBe(false);
  expect(await myWatchedDeals(fakeDb({ lightning_deal_watches: { data: null, error: { message: 'down' } } }).db, 'US', NOW)).toEqual([]);
  expect(
    await myWatchedDeals(fakeDb({ lightning_deal_watches: { data: [{ deal_id: 'a' }], error: null }, lightning_deals: { data: null, error: { message: 'down' } } }).db, 'US', NOW),
  ).toEqual([]);
});
