import type { Metadata } from 'next';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { listAdminReturns, returnFilter, type AdminReturnFilter } from '@/lib/data/admin-returns';
import { messageFor } from '@/lib/data/errors';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';
import { returnAction } from './actions';
import { ReturnRow } from './ReturnRow';

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
