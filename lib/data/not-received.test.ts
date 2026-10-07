import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import { parseMissingResolution, reportNotReceived } from './not-received';

vi.mock('server-only', () => ({}));
const refundReturn = vi.fn();
vi.mock('./refunds', () => ({ refundReturn: (...a: unknown[]) => refundReturn(...a) }));

const row = (over: object = {}) => ({
  id: 'r1', order_id: 'o1', status: 'received', reason: 'not_received', resolution: 'refund',
  items_minor: 2000, tax_minor: 0, ship_minor: 0, refund_minor: 2000, refund_status: 'succeeded',
  dropoff_code: 'AB12-CD34', dropoff_by: '2026-10-07T00:00:00Z', created_at: '2026-10-07T00:00:00Z', items: [], ...over,
});

function fakeDb(data: object) {
  const calls: [string, object][] = [];
  const db = { rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data, error: null }) } as unknown as Db;
  return { db, calls };
}

beforeEach(() => refundReturn.mockReset());

it('reads the shopper’s choice: refund unless they asked for a replacement', () => {
  expect(parseMissingResolution(undefined)).toBe('refund');
  expect(parseMissingResolution('')).toBe('refund');
  expect(parseMissingResolution('refund')).toBe('refund');
  expect(parseMissingResolution('replacement')).toBe('replacement');
  for (const bad of ['exchange', 1, true, {}]) {
    expect(() => parseMissingResolution(bad)).toThrow(expect.objectContaining({ code: 'invalid_input', detail: 'resolution' }));
  }
});

it('asks for a refund without naming it, so it works before replacements reach the database', async () => {
  const { db, calls } = fakeDb(row());
  await reportNotReceived(db, 'o1');
  expect(calls).toEqual([['report_not_received', { p_order_id: 'o1' }]]);
});

it('asks for a replacement and sends nothing to Stripe', async () => {
  const { db, calls } = fakeDb(row({
    resolution: 'replacement', items_minor: 0, refund_minor: 0,
    replacement_shipped_at: '2026-10-07T10:00:00Z', replacement_delivered_at: '2026-10-09T18:30:00Z',
  }));
  const r = await reportNotReceived(db, 'o1', 'replacement');
  expect(calls).toEqual([['report_not_received', { p_order_id: 'o1', p_resolution: 'replacement' }]]);
  expect(r.resolution).toBe('replacement');
  expect(r.replacement).toEqual({ shippedAt: '2026-10-07T10:00:00Z', deliveredAt: '2026-10-09T18:30:00Z' });
  expect(refundReturn).not.toHaveBeenCalled();
});

it('refuses an unknown choice before calling the database', async () => {
  const { db, calls } = fakeDb(row());
  await expect(reportNotReceived(db, 'o1', 'exchange')).rejects.toMatchObject({ code: 'invalid_input', detail: 'resolution' });
  expect(calls).toHaveLength(0);
});
