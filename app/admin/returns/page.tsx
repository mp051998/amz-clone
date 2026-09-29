import type { Metadata } from 'next';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { fieldClass } from '@/components/lib/controls';
import { StatusChip } from '@/components/orders/Tracking';
import { itemsText, REASON_LABEL, refundBreakdown, returnChip } from '@/components/orders/Returns';
import { paymentText } from '@/components/orders/format';
import { canRetryReturnRefund, listAdminReturns, returnFilter, type AdminReturn, type AdminReturnFilter } from '@/lib/data/admin-returns';
import { messageFor } from '@/lib/data/errors';
import { STORE_FAULT_REASONS } from '@/lib/data/returns';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';
import { adminTime } from '../orders/labels';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';
import { returnAction } from './actions';

export const metadata: Metadata = { title: 'Returns · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const FILTER_LABEL: Record<AdminReturnFilter, string> = { open: 'Open', refund_issues: 'Refund issues', closed: 'Closed', all: 'All' };
const DONE: Record<string, string> = {
  receive: 'Return received. The stock is back and the refund went through.',
  receive_pending: 'Return received and the stock is back. The card refund is under way.',
  receive_failed: 'Return received and the stock is back, but the card refund didn’t go through. Retry it under Refund issues.',
  reject: 'Return rejected. The shopper sees your note.',
  refund: 'Refund sent again.',
};
const ERROR: Record<string, string> = {
  refund_failed: 'The refund didn’t go through again. Check the payment on Stripe, then retry.',
};
const EMPTY: Record<AdminReturnFilter, [string, string]> = {
  open: ['No returns waiting.', 'Returns shoppers start show up here until the items come back.'],
  refund_issues: ['No refund problems.', 'Received returns whose card refund failed or stalled show up here.'],
  closed: ['No closed returns yet.', 'Refunded, rejected and cancelled returns show up here.'],
  all: ['No returns yet.', 'Returns shoppers start show up here.'],
};

/**
 * /admin/returns (and /in/admin/returns): returns waiting for their items, card refunds that need
 * another go, and the history. Receiving puts the stock back and refunds the shopper; rejecting
 * closes the return with a note.
 */
export default async function AdminReturnsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/returns');
  if (!admin) return <AdminOnly store={store} />;

  const filter = returnFilter(one(sp, 'filter'));
  const page = Math.max(1, Number.parseInt(one(sp, 'page'), 10) || 1);
  const result = await listAdminReturns(await db(), store.id, { filter, page });
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const to = (path: string) => storePath(store, path);
  const listHref = (n: number, f: AdminReturnFilter = filter) => {
    const out = new URLSearchParams();
    if (f !== 'open') out.set('filter', f);
    if (n > 1) out.set('page', String(n));
    const qs = out.toString();
    return to(`/admin/returns${qs ? `?${qs}` : ''}`);
  };
  const error = one(sp, 'error');
  const done = one(sp, 'done');
  const act = (id: string, move: string) => returnAction.bind(null, id, move, filter);
  const n = (v: number) => v.toLocaleString('en-US');

  return (
    <AdminFrame
      store={store}
      path="/admin/returns"
      title="Returns"
      lede={<>Shoppers can return delivered items within {store.returns.days} days. Mark a return received when the items reach you: that puts the stock back and refunds the shopper.</>}
    >
      <AdminTabs
        label="Return filter"
        tabs={(['open', 'refund_issues', 'closed', 'all'] as const).map((f) => ({ href: listHref(1, f), label: `${FILTER_LABEL[f]} (${n(result.counts[f])})`, current: f === filter }))}
      />
      {error ? <Alert tone="error">{ERROR[error] ?? messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert> : null}
      {!error && DONE[done] ? <Alert tone={done === 'receive_failed' ? 'error' : 'success'}>{DONE[done]}</Alert> : null}

      {result.returns.length ? (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {result.returns.map((r) => (
            <li key={r.id}>
              <ReturnRow r={r} store={store} to={to} act={act} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={EMPTY[filter][0]}>{EMPTY[filter][1]}</EmptyState>
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

function ReturnRow({
  r,
  store,
  to,
  act,
}: {
  r: AdminReturn;
  store: Parameters<typeof adminTime>[1];
  to: (path: string) => string;
  act: (id: string, move: string) => (formData?: FormData) => Promise<void>;
}) {
  const money = (minor: number) => formatMoney(minor, r.order.currency);
  const refund = money(r.refundMinor);
  // where the money goes, in the admin's words (the shopper sees "your …")
  const dest = r.order.paymentMethod === 'cod' ? 'Bank transfer (paid on delivery)' : paymentText(r.order.paymentMethod, r.order.paymentLabel) || 'Card';
  const fault = (STORE_FAULT_REASONS as readonly string[]).includes(r.reason);
  // rejected or cancelled: nothing was refunded
  const unpaid = r.status === 'rejected' || r.status === 'cancelled';
  const when =
    r.status === 'requested'
      ? `Started ${adminTime(r.createdAt, store)} · drop off by ${adminTime(r.dropoffBy, store)}`
      : r.status === 'received'
        ? `Received ${adminTime(r.receivedAt ?? r.createdAt, store)}${r.refund?.refundedAt ? ` · refunded ${adminTime(r.refund.refundedAt, store)}` : ''}`
        : r.status === 'rejected'
          ? `Rejected ${adminTime(r.rejectedAt ?? r.createdAt, store)}`
          : `Cancelled by the shopper ${adminTime(r.cancelledAt ?? r.createdAt, store)}`;

  return (
    <article aria-labelledby={`rt-${r.id}`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            <a href={to(`/admin/orders/${encodeURIComponent(r.order.id)}`)} className="font-mono text-ink-2 underline underline-offset-2 hover:text-ink">{r.order.id}</a>
            <span aria-hidden>·</span>
            <span>{r.customer.name || r.customer.email || 'Customer'}</span>
            {r.customer.email && r.customer.name ? <a href={`mailto:${r.customer.email}`} className="break-all text-ink-3 underline underline-offset-2">{r.customer.email}</a> : null}
          </span>
          <strong id={`rt-${r.id}`} className="text-[16px] font-semibold leading-[1.35]">{itemsText(r)}</strong>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <StatusChip {...returnChip(r)} />
          <StatusChip label={REASON_LABEL[r.reason]} tone={fault ? 'warn' : 'neutral'} />
        </span>
      </div>

      {r.comment ? <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55] text-ink-2">“{r.comment}”</p> : null}
      {r.rejectNote ? <p className="m-0 text-[14px] text-ink-2">Note to shopper: {r.rejectNote}</p> : null}

      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-5 gap-y-2 text-[14px]">
        <div className="flex flex-col"><dt className="text-[13px] text-ink-3">{unpaid ? 'Asked for' : 'Refund'}</dt><dd className={`m-0 font-semibold tabular-nums ${unpaid ? 'text-ink-3 line-through' : ''}`}>{refund}</dd></div>
        <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Refund to</dt><dd className="m-0">{dest}</dd></div>
        <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Breakdown</dt><dd className="m-0 tabular-nums">{refundBreakdown(r, r.order.currency)}</dd></div>
        <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Drop-off code</dt><dd className="m-0 font-mono tracking-[0.06em]">{r.dropoffCode}</dd></div>
        {r.stripeRefundId ? (
          <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Stripe refund</dt><dd className="m-0 break-all font-mono text-[13px]">{r.stripeRefundId}</dd></div>
        ) : null}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-3">
        <span className="text-[13px] text-ink-3">{when} · order total {money(r.order.totalMinor)}</span>
        {r.status === 'requested' ? (
          <div className="flex flex-wrap items-start gap-2.5">
            <ConfirmAction
              action={act(r.id, 'receive')}
              label="Mark received"
              prompt={<>Items back? This restocks them and refunds {refund} ({dest}).</>}
              confirmLabel="Yes, refund"
              pendingLabel="Refunding…"
              cancelLabel="Not yet"
            />
            <details className="group">
              <summary className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Reject</summary>
              <form action={act(r.id, 'reject')} className="mt-2.5 flex w-[min(360px,80vw)] flex-col gap-2">
                <label htmlFor={`note-${r.id}`} className="text-[13px] font-semibold">Note to the shopper <span className="font-normal text-ink-3">(optional)</span></label>
                <textarea id={`note-${r.id}`} name="note" rows={2} maxLength={500} className={`${fieldClass} h-auto py-2 leading-normal`} placeholder="e.g. The item came back used" />
                <button type="submit" className={`${buttonClasses({ variant: 'dark', size: 'sm' })} self-start`}>Reject return</button>
              </form>
            </details>
          </div>
        ) : canRetryReturnRefund(r) ? (
          <form action={act(r.id, 'refund')}>
            <button type="submit" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Retry refund</button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
