import type { Metadata } from 'next';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { fieldClass } from '@/components/lib/controls';
import { RETURN_SUMMARY_CHIP } from '@/components/orders/Returns';
import { StatusChip } from '@/components/orders/Tracking';
import { paymentText } from '@/components/orders/format';
import { ADMIN_ORDER_FILTERS, listAdminOrders, orderFilter, type AdminOrderFilter } from '@/lib/data/admin-orders';
import { returnSummaries } from '@/lib/data/returns';
import { messageFor } from '@/lib/data/errors';
import { formatMoney } from '@/lib/marketplaces';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';
import { FILTER_LABEL, REFUND_CHIP, STAGE_CHIP, adminTime } from './labels';

export const metadata: Metadata = { title: 'Orders · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

/**
 * /admin/orders (and /in/admin/orders): the store's placed or charged orders, newest first,
 * filtered by stage (or refunds that need a look) and searchable by order number or email.
 */
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/orders');
  if (!admin) return <AdminOnly store={store} />;

  const q = one(sp, 'q').trim();
  const filter = orderFilter(one(sp, 'filter'));
  const page = Math.max(1, Number.parseInt(one(sp, 'page'), 10) || 1);
  const client = await db();
  const result = await listAdminOrders(client, store.id, { filter, q, page });
  // admins read every return (a chip per order with one)
  const returns = await returnSummaries(client, result.orders.map((o) => o.id));
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const to = (path: string) => storePath(store, path);
  const listHref = (n: number, f: AdminOrderFilter = filter) => {
    const out = new URLSearchParams();
    if (f !== 'all') out.set('filter', f);
    if (q) out.set('q', q);
    if (n > 1) out.set('page', String(n));
    const qs = out.toString();
    return to(`/admin/orders${qs ? `?${qs}` : ''}`);
  };
  const error = one(sp, 'error');
  const n = (v: number) => v.toLocaleString('en-US');

  return (
    <AdminFrame
      store={store}
      path="/admin/orders"
      title="Orders"
      lede={<>Orders move along on their own schedule. Open one to ship it early, mark it delivered, or cancel and refund it.</>}
    >
      <AdminTabs
        label="Order stage"
        tabs={ADMIN_ORDER_FILTERS.map((f) => ({ href: listHref(1, f), label: `${FILTER_LABEL[f]} (${n(result.counts[f])})`, current: f === filter }))}
      />
      {error ? <Alert tone="error">{messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert> : null}

      <form role="search" aria-label="Search orders" className="flex flex-wrap items-end gap-3" action={to('/admin/orders')}>
        {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
        <div className="flex min-w-[220px] flex-[1_1_320px] flex-col gap-1.5">
          <label htmlFor="orders-q" className="text-[14px] font-semibold">Search</label>
          <input id="orders-q" name="q" defaultValue={q} placeholder="Order number or customer email" className={fieldClass} />
        </div>
        <button type="submit" className={buttonClasses({ variant: 'secondary', size: 'md' })}>Search</button>
        {q ? <a href={listHref(1)} className={buttonClasses({ variant: 'link' })}>Clear</a> : null}
      </form>

      {result.orders.length ? (
        <div className="overflow-x-auto rounded-panel border border-line bg-surface">
          <table className="w-full min-w-[820px] border-collapse text-left text-[14px]">
            <caption className="sr-only">{FILTER_LABEL[filter]} orders, newest first</caption>
            <thead>
              <tr className="border-b border-line text-[12px] font-mono uppercase tracking-[0.04em] text-ink-3">
                <th scope="col" className="px-4 py-3 font-normal">Order</th>
                <th scope="col" className="px-4 py-3 font-normal">Customer</th>
                <th scope="col" className="px-4 py-3 font-normal">Items</th>
                <th scope="col" className="px-4 py-3 text-right font-normal">Total</th>
                <th scope="col" className="px-4 py-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.orders.map((o) => {
                const refund = o.refundStatus ? REFUND_CHIP[o.refundStatus] : undefined;
                return (
                  <tr key={o.id} className="border-b border-line-2 last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-3">
                      <a href={to(`/admin/orders/${encodeURIComponent(o.id)}`)} className="font-mono font-semibold text-ink no-underline hover:underline">{o.id}</a>
                      <span className="block text-[12px] text-ink-3">{adminTime(o.placedAt ?? o.createdAt, store)}</span>
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <span className="block truncate">{o.customer.name || o.shipName}</span>
                      <span className="block truncate text-[12px] text-ink-3">{o.customer.email ?? '—'}</span>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <span className="line-clamp-1">{o.firstTitle ?? '—'}</span>
                      <span className="block text-[12px] text-ink-3">{o.itemCount} {o.itemCount === 1 ? 'item' : 'items'} · {paymentText(o.paymentMethod, o.paymentLabel)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(o.totalMinor, o.currency)}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1.5">
                        <StatusChip {...STAGE_CHIP[o.stage]} />
                        {refund ? <StatusChip {...refund} /> : null}
                        {returns.has(o.id) ? <StatusChip {...RETURN_SUMMARY_CHIP[returns.get(o.id)!]} /> : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={q ? 'No orders match.' : 'No orders here.'}>
          {q ? 'Search by the full or partial order number (e.g. 114-12), or part of the customer’s email.' : 'Orders show up here once they’re placed.'}
        </EmptyState>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-[14px]">
          {result.page > 1 ? <a href={listHref(result.page - 1)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>← Previous</a> : <span />}
          <span className="text-ink-2">Page {result.page} of {pageCount}</span>
          {result.page < pageCount ? <a href={listHref(result.page + 1)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Next →</a> : <span />}
        </nav>
      ) : null}
    </AdminFrame>
  );
}
