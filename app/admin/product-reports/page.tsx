import type { Metadata } from 'next';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { StatusChip } from '@/components/orders/Tracking';
import { fieldClass } from '@/components/lib/controls';
import { cn } from '@/components/lib/cn';
import { messageFor } from '@/lib/data/errors';
import { listProductReportQueue, productReportView, type ProductReportStatus, type ProductReportView } from '@/lib/data/product-reports';
import { PRODUCT_REPORT_LABELS } from '@/lib/product-reports';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminTime } from '../orders/labels';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';
import { resolveReportAction } from './actions';

export const metadata: Metadata = { title: 'Product reports · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const VIEW_LABEL: Record<ProductReportView, string> = { open: 'Open', closed: 'Closed', all: 'All' };
const STATUS_CHIP: Record<ProductReportStatus, { label: string; tone: 'warn' | 'good' | 'neutral' }> = {
  open: { label: 'Open', tone: 'warn' },
  resolved: { label: 'Resolved', tone: 'good' },
  dismissed: { label: 'Dismissed', tone: 'neutral' },
};
const DONE: Record<string, string> = {
  resolved: 'Report resolved.',
  dismissed: 'Report dismissed.',
};

/**
 * /admin/product-reports (and /in/admin/product-reports): what shoppers reported with "Report an
 * issue with this product" on this store's products. Open ones oldest first; an admin fixes the
 * listing (Edit listing) and resolves the report, or dismisses it, with an optional note.
 */
export default async function AdminProductReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/product-reports');
  if (!admin) return <AdminOnly store={store} />;

  const view = productReportView(one(sp, 'view'));
  const page = Math.max(1, Number.parseInt(one(sp, 'page'), 10) || 1);
  const result = await listProductReportQueue(await db(), store.id, { view, page });
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const to = (path: string) => storePath(store, path);
  const listHref = (n: number, v: ProductReportView = view) => {
    const out = new URLSearchParams();
    if (v !== 'open') out.set('view', v);
    if (n > 1) out.set('page', String(n));
    const qs = out.toString();
    return to(`/admin/product-reports${qs ? `?${qs}` : ''}`);
  };
  const error = one(sp, 'error');
  const done = one(sp, 'done');
  const n = (v: number) => v.toLocaleString('en-US');

  return (
    <AdminFrame
      store={store}
      path="/admin/product-reports"
      title="Product reports"
      lede={<>What shoppers say is wrong with a listing. Fix the listing and resolve the report, or dismiss it; shoppers aren’t told either way.</>}
    >
      <AdminTabs
        label="Report views"
        tabs={(['open', 'closed', 'all'] as const).map((v) => ({ href: listHref(1, v), label: `${VIEW_LABEL[v]} (${n(result.counts[v])})`, current: v === view }))}
      />
      {error ? <Alert tone="error">{messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert> : null}
      {!error && DONE[done] ? <Alert tone="success">{DONE[done]}</Alert> : null}

      {result.reports.length ? (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {result.reports.map((r) => {
            const chip = STATUS_CHIP[r.status];
            return (
              <li key={r.id}>
                <article aria-labelledby={`r-${r.id}`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      {r.productArchived ? (
                        <span className="line-clamp-1 text-[13px] text-ink-2">{r.productTitle} (archived)</span>
                      ) : (
                        <a href={to(`/product/${encodeURIComponent(r.productId)}`)} className="line-clamp-1 text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink">{r.productTitle}</a>
                      )}
                      <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                        <span>{r.reporter}</span>
                        <span aria-hidden>·</span>
                        <span>{adminTime(r.updatedAt, store)}</span>
                      </span>
                    </div>
                    <StatusChip label={chip.label} tone={chip.tone} />
                  </div>
                  <strong id={`r-${r.id}`} className="text-[17px] font-semibold leading-[1.3]">{PRODUCT_REPORT_LABELS[r.reason]}</strong>
                  {r.details ? <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55] text-ink-2">{r.details}</p> : null}

                  {r.status === 'open' ? (
                    <form action={resolveReportAction.bind(null, r.id, view)} className="flex flex-col gap-2.5 border-t border-line-2 pt-3">
                      <label htmlFor={`note-${r.id}`} className="text-[13px] font-semibold">
                        Note <span className="font-normal text-ink-3">(optional, for other admins)</span>
                      </label>
                      <input id={`note-${r.id}`} name="note" maxLength={500} className={cn(fieldClass, 'h-10')} placeholder="e.g. Corrected the battery count in the bullets." />
                      <div className="flex flex-wrap items-center justify-end gap-2.5">
                        {r.productArchived ? null : (
                          <a href={to(`/admin/products/${encodeURIComponent(r.productId)}`)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Edit listing</a>
                        )}
                        <button type="submit" name="status" value="dismissed" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Dismiss</button>
                        <button type="submit" name="status" value="resolved" className={buttonClasses({ variant: 'primary', size: 'sm' })}>Resolve</button>
                      </div>
                    </form>
                  ) : (
                    <p className="m-0 border-t border-line-2 pt-3 text-[13px] text-ink-3">
                      {chip.label} {r.resolvedAt ? adminTime(r.resolvedAt, store) : ''}
                      {r.resolutionNote ? <> · <span className="text-ink-2">{r.resolutionNote}</span></> : null}
                    </p>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={view === 'open' ? 'No open reports.' : view === 'closed' ? 'No closed reports yet.' : 'No reports yet.'}>
          {view === 'open' ? 'When a shopper reports an issue with a product, it shows up here.' : 'Reports you resolve or dismiss show up here, latest first.'}
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
