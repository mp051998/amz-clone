import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { assertStoreReport, listProductReportQueue, myOpenReport, reportProduct, resolveProductReport } from '@/lib/data/product-reports';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const code = async (p: PromiseLike<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('product reports', () => {
  let shopper: TestUser;
  let other: TestUser;
  let agent: TestUser;
  let usProduct: string;
  let inProduct: string;
  beforeAll(async () => {
    [shopper, other, agent] = await Promise.all([newUser('Report Shopper'), newUser('Report Other'), newUser('Reports Agent')]);
    const { error } = await admin().from('admins').insert({ user_id: agent.id });
    if (error) throw error;
    [usProduct, inProduct] = (await Promise.all([pickProduct('US', 64), pickProduct('IN', 49)])).map((p) => p.id);
  });
  afterAll(async () => {
    await admin().from('product_reports').delete().in('product_id', [usProduct, inProduct]);
    await admin().from('admins').delete().eq('user_id', agent.id);
    await Promise.all([shopper, other, agent].map(deleteUser));
  });

  it('files one open report per shopper and product, rewriting it on a second report', async () => {
    const first = await reportProduct(shopper.db, usProduct, { reason: 'pricing', details: 'Shows $5 but charges $50' });
    expect(first.updated).toBe(false);
    expect(first.report).toMatchObject({ productId: usProduct, reason: 'pricing', details: 'Shows $5 but charges $50', status: 'open', resolvedAt: null });

    const again = await reportProduct(shopper.db, usProduct, { reason: 'wrong_info' });
    expect(again.updated).toBe(true);
    expect(again.report).toMatchObject({ id: first.report.id, reason: 'wrong_info', details: null });
    expect((await myOpenReport(shopper.db, usProduct, shopper.id))?.id).toBe(first.report.id);
    expect(await myOpenReport(other.db, usProduct, other.id)).toBeNull();
  });

  it('checks the reason and details in the database too', async () => {
    const rpc = (args: { p_product: string; p_reason: string; p_details?: string }) => shopper.db.rpc('report_product', args);
    expect((await rpc({ p_product: usProduct, p_reason: 'boring' })).error?.message).toBe('invalid_input');
    expect((await rpc({ p_product: usProduct, p_reason: 'other' })).error?.message).toBe('invalid_input');
    expect((await rpc({ p_product: usProduct, p_reason: 'other', p_details: '   short  ' })).error?.message).toBe('invalid_input');
    expect((await rpc({ p_product: usProduct, p_reason: 'pricing', p_details: 'x'.repeat(1001) })).error?.message).toBe('invalid_input');
    expect((await rpc({ p_product: 'no-such-product', p_reason: 'pricing' })).error?.message).toBe('product_not_found');
    expect((await anon().rpc('report_product', { p_product: usProduct, p_reason: 'pricing' })).error).not.toBeNull();
  });

  it('keeps reports private to the reporter and the store’s admins', async () => {
    const { data: mine } = await shopper.db.from('product_reports').select('id').eq('product_id', usProduct);
    expect(mine).toHaveLength(1);
    const { data: theirs } = await other.db.from('product_reports').select('id').eq('product_id', usProduct);
    expect(theirs).toEqual([]);
    const { data: nobody } = await anon().from('product_reports').select('id').eq('product_id', usProduct);
    expect(nobody ?? []).toEqual([]);
    const { error: write } = await shopper.db.from('product_reports').update({ status: 'resolved' }).eq('product_id', usProduct);
    expect(write).not.toBeNull();
  });

  it('admins work the queue: open first, then resolved with a note, once', async () => {
    const elsewhere = await reportProduct(other.db, inProduct, { reason: 'counterfeit', details: 'Logo is misspelled' });
    const open = await listProductReportQueue(agent.db, 'US');
    const row = open.reports.find((r) => r.productId === usProduct && r.reporter === 'Report Shopper')!;
    expect(row).toMatchObject({ reason: 'wrong_info', status: 'open', productArchived: false });
    expect(row.productTitle).not.toBe('');
    expect(open.reports.map((r) => r.id)).not.toContain(elsewhere.report.id);
    expect(open.counts.open).toBe(open.total);

    await assertStoreReport(agent.db, 'US', row.id);
    expect(await code(assertStoreReport(agent.db, 'US', elsewhere.report.id))).toBe('report_not_found');
    expect(await code(assertStoreReport(agent.db, 'US', crypto.randomUUID()))).toBe('report_not_found');

    expect(await code(resolveProductReport(shopper.db, row.id, 'resolved'))).toBe('forbidden');
    const done = await resolveProductReport(agent.db, row.id, 'resolved', '  Fixed the price  ');
    expect(done).toMatchObject({ id: row.id, status: 'resolved', resolutionNote: 'Fixed the price' });
    expect(done.resolvedAt).not.toBeNull();
    expect(await code(resolveProductReport(agent.db, row.id, 'dismissed'))).toBe('report_closed');
    expect(await myOpenReport(shopper.db, usProduct, shopper.id)).toBeNull();

    const closed = await listProductReportQueue(agent.db, 'US', { view: 'closed' });
    expect(closed.reports.find((r) => r.id === row.id)).toMatchObject({ status: 'resolved', resolutionNote: 'Fixed the price' });
    expect((await listProductReportQueue(agent.db, 'US')).reports.map((r) => r.id)).not.toContain(row.id);

    // closed, so the next report is a new one
    const fresh = await reportProduct(shopper.db, usProduct, { reason: 'safety', details: 'Battery got very hot' });
    expect(fresh.updated).toBe(false);
    expect(fresh.report.id).not.toBe(row.id);

    const dismissed = await resolveProductReport(agent.db, elsewhere.report.id, 'dismissed');
    expect(dismissed).toMatchObject({ status: 'dismissed', resolutionNote: null });
  });
});
