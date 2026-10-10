import type { Metadata } from 'next';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { StatusChip } from '@/components/orders/Tracking';
import { listReviewQueue, queueView, type QueuedReview, type ReviewQueueView } from '@/lib/data/admin-reviews';
import { messageFor } from '@/lib/data/errors';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminTime } from '../orders/labels';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';
import { reviewAction } from './actions';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Reviews · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const VIEW_LABEL: Record<ReviewQueueView, string> = { reported: 'Reported', hidden: 'Hidden' };
const REASON_LABEL: Record<string, string> = { spam: 'Spam', offensive: 'Offensive', off_topic: 'Off topic', other: 'Other' };
const DONE: Record<string, string> = {
  keep: 'Review kept. It’s visible again, and its reports are resolved.',
  hide: 'Review hidden from shoppers.',
  delete: 'Review deleted.',
};

const reasonsText = (r: QueuedReview) =>
  Object.entries(r.reasons)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${REASON_LABEL[k] ?? k} ${n}`)
    .join(' · ');

/**
 * /admin/reviews (and /in/admin/reviews): reviews shoppers reported (three open reports hide one
 * automatically) and everything hidden. Keep puts a review back and resolves its reports; hide
 * takes it down; delete removes it.
 */
export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/reviews');
  if (!admin) return <AdminOnly store={store} />;

  const view = queueView(one(sp, 'view'));
  const page = Math.max(1, Number.parseInt(one(sp, 'page'), 10) || 1);
  const result = await listReviewQueue(await db(), store.id, { view, page });
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const to = (path: string) => storePath(store, path);
  const listHref = (n: number, v: ReviewQueueView = view) => {
    const out = new URLSearchParams();
    if (v !== 'reported') out.set('view', v);
    if (n > 1) out.set('page', String(n));
    const qs = out.toString();
    return to(`/admin/reviews${qs ? `?${qs}` : ''}`);
  };
  const error = one(sp, 'error');
  const done = one(sp, 'done');
  const act = (id: string, action: string) => reviewAction.bind(null, id, action, view);
  const n = (v: number) => v.toLocaleString('en-US');

  return (
    <AdminFrame
      store={store}
      path="/admin/reviews"
      title="Reviews"
      lede={<>Three reports from different shoppers hide a review until you look at it. Keeping one resolves its reports; it takes three new ones to hide it again.</>}
    >
      <AdminTabs
        label="Review queue"
        tabs={(['reported', 'hidden'] as const).map((v) => ({ href: listHref(1, v), label: `${VIEW_LABEL[v]} (${n(result.counts[v])})`, current: v === view }))}
      />
      {error ? <Alert tone="error">{messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert> : null}
      {!error && DONE[done] ? <Alert tone="success">{DONE[done]}</Alert> : null}

      {result.reviews.length ? (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {result.reviews.map((r) => (
            <li key={r.id}>
              <article aria-labelledby={`rv-${r.id}`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <a href={to(`/product/${encodeURIComponent(r.productId)}`)} className="line-clamp-1 text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink">{r.productTitle}</a>
                    <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                      <span role="img" aria-label={`${r.rating} out of 5 stars`} className="tracking-[1px] text-star">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                      <span>{r.author}</span>
                      <span aria-hidden>·</span>
                      <span>{adminTime(r.createdAt, store)}</span>
                    </span>
                  </div>
                  <span className="flex flex-wrap gap-1.5">
                    {r.hiddenAt ? <StatusChip label={r.hiddenReason === 'admin' ? 'Hidden by admin' : 'Hidden by reports'} tone="dark" /> : <StatusChip label="Visible" tone="good" />}
                    {r.openReports ? <StatusChip label={`${r.openReports} open ${r.openReports === 1 ? 'report' : 'reports'}`} tone="warn" /> : null}
                    {r.verified ? <StatusChip label="Verified purchase" tone="neutral" /> : null}
                    {r.seeded ? <StatusChip label="Catalogue review" tone="neutral" /> : null}
                  </span>
                </div>
                <strong id={`rv-${r.id}`} className="text-[17px] font-semibold leading-[1.3]">{r.title}</strong>
                <p className="m-0 line-clamp-6 whitespace-pre-line text-[15px] leading-[1.55] text-ink-2">{r.body}</p>
                {r.photos.length ? (
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Photos on this review">
                    {r.photos.map((p, i) => (
                      <li key={p.path}>
                        <a href={p.url} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden rounded-image border border-line hover:border-ink">
                          <img src={p.url} alt={`Photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-3">
                  <span className="text-[13px] text-ink-3">
                    {r.openReports ? <>Reasons: {reasonsText(r)}{r.lastReportedAt ? ` · last ${adminTime(r.lastReportedAt, store)}` : ''}</> : r.hiddenAt ? <>Hidden {adminTime(r.hiddenAt, store)}</> : null}
                    {r.moderatedAt ? <>{r.openReports || r.hiddenAt ? ' · ' : ''}Last reviewed {adminTime(r.moderatedAt, store)}</> : null}
                  </span>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <form action={act(r.id, 'keep')}>
                      <SubmitButton variant="secondary" size="sm">{r.hiddenAt ? 'Show again' : 'Keep'}</SubmitButton>
                    </form>
                    {r.hiddenReason !== 'admin' ? (
                      <form action={act(r.id, 'hide')}>
                        <SubmitButton variant="secondary" size="sm">{r.hiddenAt ? 'Keep hidden' : 'Hide'}</SubmitButton>
                      </form>
                    ) : null}
                    <ConfirmAction
                      action={act(r.id, 'delete')}
                      label="Delete"
                      prompt={<>Delete this review for good? Its votes and reports go too.</>}
                      confirmLabel="Yes, delete"
                      pendingLabel="Deleting…"
                    />
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={view === 'reported' ? 'No reports to look at.' : 'No hidden reviews.'}>
          {view === 'reported' ? 'Reviews shoppers report show up here, most reported first.' : 'Reviews hidden by reports or by an admin show up here.'}
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
