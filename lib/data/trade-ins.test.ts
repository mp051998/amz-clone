import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { DataError } from './errors';
import { cancelTradeIn, listAdminTradeIns, listTradeIns, receiveTradeIn, rejectTradeIn, requestTradeIn, tradeInFilter, type TradeIn } from './trade-ins';

/** A client whose reads and RPCs answer with `reply`, recording the filters, RPC names and arguments. */
function fakeDb(reply: { data: unknown; error: unknown }) {
  const calls: string[] = [];
  const args: unknown[] = [];
  const chain = {
    select: () => chain,
    eq: (col: string, v: unknown) => (calls.push(`${col}=${String(v)}`), chain),
    order: () => chain,
    limit: (n: number) => (calls.push(`limit=${n}`), chain),
    then: (resolve: (v: unknown) => void) => resolve(reply),
  };
  const db = {
    from: (t: string) => (calls.push(t), chain),
    rpc: async (fn: string, a?: unknown) => (calls.push(fn), args.push(a), reply),
  };
  return { db: db as unknown as Db, calls, args };
}

const ROW = {
  id: 't1', market_id: 'US', device_id: 'us-apple-iphone-14', device_name: 'Apple iPhone 14', kind: 'phone', good_minor: 25_000,
  condition: 'good', quote_minor: 25_000, status: 'open', ship_code: 'AB12-CD34', ship_by: '2026-10-15T10:00:00Z',
  received_condition: null, credited_minor: null, reject_note: null, created_at: '2026-10-08T10:00:00Z', closed_at: null,
};
const TRADE_IN: TradeIn = {
  id: 't1', deviceId: 'us-apple-iphone-14', device: 'Apple iPhone 14', kind: 'phone', condition: 'good', quoteMinor: 25_000,
  goodMinor: 25_000, status: 'open', shipCode: 'AB12-CD34', shipBy: '2026-10-15T10:00:00Z', createdAt: '2026-10-08T10:00:00Z',
};

it('lists the caller’s trade-ins in a store', async () => {
  const read = fakeDb({ data: [ROW], error: null });
  expect(await listTradeIns(read.db, 'US', 10)).toEqual([TRADE_IN]);
  expect(read.calls).toEqual(['trade_ins', 'market_id=US', 'limit=10']);
});

it('requests and cancels a trade-in', async () => {
  const req = fakeDb({ data: ROW, error: null });
  expect(await requestTradeIn(req.db, 'us-apple-iphone-14', 'good')).toEqual(TRADE_IN);
  expect(req.calls).toEqual(['request_trade_in']);
  expect(req.args).toEqual([{ p_device: 'us-apple-iphone-14', p_condition: 'good' }]);

  const cancel = fakeDb({ data: { ...ROW, status: 'cancelled', closed_at: '2026-10-09T10:00:00Z' }, error: null });
  expect(await cancelTradeIn(cancel.db, 't1')).toEqual({ ...TRADE_IN, status: 'cancelled', closedAt: '2026-10-09T10:00:00Z' });
  expect(cancel.args).toEqual([{ p_id: 't1' }]);
});

it('passes on the database’s refusals', async () => {
  const full = fakeDb({ data: null, error: { code: 'P0001', message: 'trade_in_limit', details: null, hint: null } });
  await expect(requestTradeIn(full.db, 'us-apple-iphone-14', 'good')).rejects.toMatchObject({ code: 'trade_in_limit', status: 409 });
  const closed = fakeDb({ data: null, error: { code: 'P0001', message: 'trade_in_closed', details: null, hint: null } });
  await expect(cancelTradeIn(closed.db, 't1')).rejects.toBeInstanceOf(DataError);
});

it('reads the admin queue with its counts and customers', async () => {
  const list = fakeDb({
    data: { counts: { open: 1, closed: 2, all: 3 }, trade_ins: [{ ...ROW, customer: { id: 'u1', email: 'a@example.test', name: null } }] },
    error: null,
  });
  expect(await listAdminTradeIns(list.db, 'US', 'open')).toEqual({
    counts: { open: 1, closed: 2, all: 3 },
    tradeIns: [{ ...TRADE_IN, market: 'US', customer: { id: 'u1', email: 'a@example.test', name: null } }],
  });
  expect(list.args).toEqual([{ p_market: 'US', p_filter: 'open' }]);
});

it('receives and rejects a store’s trade-in', async () => {
  const credited = {
    ...ROW, status: 'credited', received_condition: 'screen_damaged', credited_minor: 12_500, closed_at: '2026-10-10T10:00:00Z',
    customer: { id: 'u1', email: null, name: 'Sam' },
  };
  const recv = fakeDb({ data: credited, error: null });
  const r = await receiveTradeIn(recv.db, 'US', 't1', 'screen_damaged');
  expect(r).toMatchObject({ status: 'credited', receivedCondition: 'screen_damaged', creditedMinor: 12_500, customer: { name: 'Sam' } });
  expect(recv.args).toEqual([{ p_id: 't1', p_market: 'US', p_condition: 'screen_damaged' }]);

  const rej = fakeDb({ data: { ...ROW, status: 'rejected', reject_note: 'Not an iPhone 14', customer: {} }, error: null });
  expect((await rejectTradeIn(rej.db, 'US', 't1', '  Not an iPhone 14 ')).rejectNote).toBe('Not an iPhone 14');
  expect(rej.args).toEqual([{ p_id: 't1', p_market: 'US', p_note: 'Not an iPhone 14' }]);

  const blank = fakeDb({ data: { ...ROW, status: 'rejected', customer: {} }, error: null });
  await rejectTradeIn(blank.db, 'US', 't1', '   ');
  expect(blank.args).toEqual([{ p_id: 't1', p_market: 'US' }]);
});

it('reads a queue filter, open by default', () => {
  expect(tradeInFilter('closed')).toBe('closed');
  expect(tradeInFilter('all')).toBe('all');
  expect(tradeInFilter('nope')).toBe('open');
  expect(tradeInFilter(undefined)).toBe('open');
});
