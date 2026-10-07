import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { assertStoreReport, listProductReportQueue, myOpenReport, productReportView, reportProduct, resolveProductReport } from './product-reports';

type Reply = { data: unknown; error: unknown; count?: number | null };

/** A client whose reads answer from a queue of replies per table (and per RPC), recording each call. */
function fakeDb(replies: Record<string, Reply[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'order', 'range', 'maybeSingle']) {
        q[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return q;
        };
      }
      q.then = (resolve: (r: Reply) => unknown) => resolve(replies[table]?.shift() ?? { data: [], error: null });
      return q;
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push({ table: `rpc:${fn}`, ops: [['args', [args]]] });
      return replies[`rpc:${fn}`]?.shift() ?? { data: null, error: null };
    },
  };
  return { db: db as unknown as Db, calls };
}

const ID = '00000000-0000-4000-8000-000000000001';
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, product_id: 'p1', reason: 'pricing', details: null, status: 'open', reporter_name: 'Asha',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', resolved_at: null, resolution_note: null, ...over,
});

it('files a report, sending details only when there are some', async () => {
  const { db, calls } = fakeDb({ 'rpc:report_product': [{ data: { ...row(), updated: false }, error: null }, { data: { ...row({ details: 'Box says 2' }), updated: true }, error: null }] });
  const first = await reportProduct(db, 'p1', { reason: 'pricing', details: '   ' });
  expect(first).toEqual({
    updated: false,
    report: { id: ID, productId: 'p1', reason: 'pricing', details: null, status: 'open', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', resolvedAt: null, resolutionNote: null },
  });
  expect(calls[0].ops).toEqual([['args', [{ p_product: 'p1', p_reason: 'pricing' }]]]);
  const again = await reportProduct(db, 'p1', { reason: 'pricing', details: ' Box says 2 ' });
  expect(again.updated).toBe(true);
  expect(calls[1].ops).toEqual([['args', [{ p_product: 'p1', p_reason: 'pricing', p_details: 'Box says 2' }]]]);
});

it('checks a report before sending it', async () => {
  const { db, calls } = fakeDb({});
  await expect(reportProduct(db, 'p1', { reason: 'nope' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'reason' });
  await expect(reportProduct(db, 'p1', { reason: 'other', details: 'short' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'details' });
  expect(calls).toEqual([]);
});

it('reads the shopper’s open report on a product', async () => {
  const { db, calls } = fakeDb({ product_reports: [{ data: row(), error: null }, { data: null, error: null }] });
  expect((await myOpenReport(db, 'p1', 'u1'))?.reason).toBe('pricing');
  expect(calls[0].ops).toEqual(expect.arrayContaining([['eq', ['product_id', 'p1']], ['eq', ['user_id', 'u1']], ['eq', ['status', 'open']]]));
  expect(await myOpenReport(db, 'p2', 'u1')).toBeNull();
});

it('pages a store’s reports per view, open ones oldest first', async () => {
  const listed = { data: [row({ products: { market_id: 'US', title: 'Kettle', archived_at: null } })], error: null, count: 1 };
  const { db, calls } = fakeDb({ product_reports: [listed, { data: null, error: null, count: 4 }, { data: null, error: null, count: 6 }, { data: null, error: null, count: 10 }] });
  const page = await listProductReportQueue(db, 'US', { page: 2 });
  expect(page.counts).toEqual({ open: 4, closed: 6, all: 10 });
  expect(page.reports[0]).toMatchObject({ id: ID, reporter: 'Asha', productTitle: 'Kettle', productArchived: false });
  expect(calls[0].ops).toEqual(expect.arrayContaining([['eq', ['products.market_id', 'US']], ['eq', ['status', 'open']], ['order', ['created_at', { ascending: true }]], ['range', [25, 49]]]));
  expect(calls[2].ops).toContainEqual(['neq', ['status', 'open']]);

  const closed = fakeDb({});
  await listProductReportQueue(closed.db, 'IN', { view: 'closed' });
  expect(closed.calls[0].ops).toEqual(expect.arrayContaining([['neq', ['status', 'open']], ['order', ['updated_at', { ascending: false }]]]));
  expect(productReportView('closed')).toBe('closed');
  expect(productReportView('x')).toBe('open');
});

it('resolves or dismisses, checking the status, note and store', async () => {
  const { db, calls } = fakeDb({ 'rpc:resolve_product_report': [{ data: row({ status: 'resolved', resolved_at: '2026-10-03T00:00:00Z', resolution_note: 'Fixed' }), error: null }] });
  expect(await resolveProductReport(db, ID, 'resolved', ' Fixed ')).toMatchObject({ status: 'resolved', resolutionNote: 'Fixed' });
  expect(calls[0].ops).toEqual([['args', [{ p_report: ID, p_status: 'resolved', p_note: 'Fixed' }]]]);
  await expect(resolveProductReport(db, ID, 'open')).rejects.toMatchObject({ code: 'invalid_input', detail: 'status' });
  await expect(resolveProductReport(db, ID, 'dismissed', 'x'.repeat(501))).rejects.toMatchObject({ code: 'invalid_input', detail: 'note' });

  const store = fakeDb({ product_reports: [{ data: null, error: null }] });
  await expect(assertStoreReport(store.db, 'US', 'nope')).rejects.toMatchObject({ code: 'report_not_found' });
  await expect(assertStoreReport(store.db, 'US', ID)).rejects.toMatchObject({ code: 'report_not_found' });
});
