import { beforeEach, expect, it, vi } from 'vitest';
import { REASON_LABEL } from '@/components/orders/Returns';
import type { Db } from '../db/client';
import type { DataError } from './errors';
import { reportMissingItems } from './missing-items';
import { isReturnReason, isStoreFault, nothingSentBack, requestMissingItems } from './returns';

vi.mock('server-only', () => ({}));
const refundReturn = vi.fn();
vi.mock('./refunds', () => ({ refundReturn: (...a: unknown[]) => refundReturn(...a) }));

const row = (over: object = {}) => ({
  id: 'r1', order_id: 'o1', status: 'received', reason: 'missing_item', resolution: 'refund',
  items: [{ product_id: 'p1', title: 'Lamp', image: '/i.png', unit_price_minor: 2000, qty: 1 }],
  items_minor: 2000, tax_minor: 160, ship_minor: 300, refund_minor: 2460, refund_status: 'succeeded', refunded_at: '2026-10-09T00:00:00Z',
  dropoff_code: 'AB12-CD34', dropoff_by: '2026-10-09T00:00:00Z', created_at: '2026-10-09T00:00:00Z', received_at: '2026-10-09T00:00:00Z', ...over,
});

/** answers request_return with `made`, and order_returns with `later` in its returns */
function fakeDb(made: object, later?: object, error?: { message: string; details: string }) {
  const calls: [string, Record<string, unknown>][] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      if (fn === 'order_returns') return { data: { delivered: true, returns: [later ?? made] }, error: null };
      return error ? { data: null, error } : { data: made, error: null };
    },
  } as unknown as Db;
  return { db, calls };
}
const items = [{ productId: 'p1', qty: 1 }];
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: DataError) => `${e.code}:${e.detail}`);

beforeEach(() => refundReturn.mockReset());

it('is the store’s fault, with nothing sent back, and not a reason on the return form', () => {
  expect(isStoreFault('missing_item')).toBe(true);
  expect(nothingSentBack('missing_item')).toBe(true);
  expect(nothingSentBack('damaged')).toBe(false);
  expect(isReturnReason('missing_item')).toBe(false);
  expect(REASON_LABEL.missing_item).toBe('Item missing from the package');
});

it('reports the items with reason missing_item, leaving a refund’s resolution out', async () => {
  const { db, calls } = fakeDb(row());
  const r = await requestMissingItems(db, 'o1', { items, comment: ' not in the box ' });
  expect(calls).toEqual([['request_return', { p_order_id: 'o1', p_items: [{ product_id: 'p1', qty: 1 }], p_reason: 'missing_item', p_comment: 'not in the box' }]]);
  expect(r).toMatchObject({ reason: 'missing_item', status: 'received', refundMinor: 2460 });
});

it('asks for a replacement, or the refund to the balance', async () => {
  const { db, calls } = fakeDb(row());
  await requestMissingItems(db, 'o1', { items, resolution: 'replacement', refundTo: 'balance' });
  await requestMissingItems(db, 'o1', { items, refundTo: 'balance' });
  expect(calls[0][1]).toMatchObject({ p_reason: 'missing_item', p_resolution: 'replacement' });
  expect(calls[0][1]).not.toHaveProperty('p_refund_to');
  expect(calls[1][1]).toMatchObject({ p_refund_to: 'balance' });
});

it('turns bad input away before the database, in its own words', async () => {
  const { db, calls } = fakeDb(row());
  expect(await code(requestMissingItems(db, 'o1', { items, resolution: 'exchange' }))).toBe('invalid_input:resolution');
  const none = await requestMissingItems(db, 'o1', { items: [{ productId: 'p1', qty: 0 }] }).catch((e: DataError) => e);
  expect(none).toMatchObject({ code: 'invalid_input', detail: 'items', message: 'Choose at least one missing item.' });
  expect(calls).toHaveLength(0);
});

it('words what the database turns away', async () => {
  const tooMany = fakeDb(row(), undefined, { message: 'invalid_input', details: 'items' });
  expect(await requestMissingItems(tooMany.db, 'o1', { items }).catch((e: DataError) => e.message)).toMatch(/can’t be reported missing/);
  const only = fakeDb(row(), undefined, { message: 'return_not_allowed', details: 'replacement_only' });
  expect(await requestMissingItems(only.db, 'o1', { items }).catch((e: DataError) => e.message)).toMatch(/choose a replacement/);
});

it('sends a pending card refund to Stripe, then reads the return again', async () => {
  const { db, calls } = fakeDb(row({ refund_status: 'pending', refunded_at: null }), row({ stripe_refund_id: 're_1' }));
  const r = await reportMissingItems(db, 'o1', { items });
  expect(refundReturn).toHaveBeenCalledWith('r1');
  expect(calls.map(([fn]) => fn)).toEqual(['request_return', 'order_returns']);
  expect(r.refund?.status).toBe('succeeded');
});

it('leaves Stripe alone when nothing is pending, and survives a failed refund', async () => {
  const done = fakeDb(row());
  await reportMissingItems(done.db, 'o1', { items });
  expect(refundReturn).not.toHaveBeenCalled();

  refundReturn.mockRejectedValueOnce(new Error('stripe down'));
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  const pending = fakeDb(row({ refund_status: 'pending', refunded_at: null }));
  expect((await reportMissingItems(pending.db, 'o1', { items })).refund?.status).toBe('pending');
  expect(err).toHaveBeenCalled();
  err.mockRestore();
});
