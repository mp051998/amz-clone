import type { Metadata } from 'next';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { CaseStatus } from '@/components/support/CaseThread';
import { caseView, listCaseQueue, TOPIC_LABELS, type CaseQueueView } from '@/lib/data/support';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminTime } from '../orders/labels';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';

export const metadata: Metadata = { title: 'Support · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const VIEW_LABEL: Record<CaseQueueView, string> = { waiting: 'Waiting on us', answered: 'Answered', closed: 'Closed' };
const EMPTY: Record<CaseQueueView, [string, string]> = {
  waiting: ['Nobody is waiting on a reply.', 'New cases, and cases a shopper replied on, show up here, longest waiting first.'],
  answered: ['No answered cases.', 'Cases you replied on wait here for the shopper.'],
  closed: ['No closed cases yet.', 'Cases closed by you or the shopper end up here.'],
};

/**
 * /admin/support (and /in/admin/support): shoppers' support cases in this store. Waiting cases
 * come longest-waiting first; answered and closed ones latest first. Each opens its thread.
 */
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/support');
  if (!admin) return <AdminOnly store={store} />;

  const view = caseView(one(sp, 'view'));
  const page = Math.max(1, Number.parseInt(one(sp, 'page'), 10) || 1);
  const result = await listCaseQueue(await db(), store.id, { view, page });
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const to = (path: string) => storePath(store, path);
  const listHref = (n: number, v: CaseQueueView = view) => {
    const out = new URLSearchParams();
    if (v !== 'waiting') out.set('view', v);
    if (n > 1) out.set('page', String(n));
    const qs = out.toString();
    return to(`/admin/support${qs ? `?${qs}` : ''}`);
  };
  const n = (v: number) => v.toLocaleString('en-US');

  return (
    <AdminFrame
      store={store}
      path="/admin/support"
      title="Support"
      lede={<>Cases shoppers open from “Contact us”. Reply on a case to answer it; it comes back here when they reply.</>}
    >
      <AdminTabs
        label="Case views"
        tabs={(['waiting', 'answered', 'closed'] as const).map((v) => ({ href: listHref(1, v), label: `${VIEW_LABEL[v]} (${n(result.counts[v])})`, current: v === view }))}
      />

      {result.cases.length ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {result.cases.map((c) => (
            <li key={c.id}>
              <article aria-labelledby={`case-${c.id}`} className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-[18px]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <a id={`case-${c.id}`} href={to(`/admin/support/${c.id}`)} className="text-[17px] font-semibold leading-tight text-ink underline underline-offset-2">
                      {c.subject}
                    </a>
                    <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                      <span>{c.customer || 'Customer'}</span>
                      <span aria-hidden>·</span>
                      <span>{TOPIC_LABELS[c.topic]}</span>
                      {c.seller ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>For seller <span className="font-semibold text-ink">{c.seller}</span></span>
                        </>
                      ) : null}
                      {c.orderId ? (
                        <>
                          <span aria-hidden>·</span>
                          <a href={to(`/admin/orders/${encodeURIComponent(c.orderId)}`)} className="font-mono text-ink-2 underline underline-offset-2">{c.orderId}</a>
                        </>
                      ) : null}
                      <span aria-hidden>·</span>
                      <span>{view === 'waiting' ? 'Waiting since' : 'Updated'} {adminTime(c.updatedAt, store)}</span>
                    </span>
                  </div>
                  <CaseStatus status={c.status} viewer="agent" />
                </div>
                {c.last ? (
                  <p className="m-0 line-clamp-2 text-[14px] leading-[1.5] text-ink-2">
                    <strong className="font-semibold text-ink">{c.last.from === 'agent' ? 'Store:' : 'Customer:'}</strong> {c.last.body}
                  </p>
                ) : null}
                <span className="text-[13px] text-ink-3">{n(c.messageCount)} {c.messageCount === 1 ? 'message' : 'messages'}</span>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={EMPTY[view][0]}>{EMPTY[view][1]}</EmptyState>
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
