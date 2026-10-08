import type { Metadata } from 'next';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { messageFor } from '@/lib/data/errors';
import { listPriceReportQueue, priceReportView, type PriceReportView } from '@/lib/data/lower-price';
import { reportTotal, siteOf, type PriceReport } from '@/lib/lower-price';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';
import { adminTime } from '../../orders/labels';
import { adminPage } from '../../guard';
import { AdminFrame, AdminOnly, AdminTabs } from '../../ui';
import { reviewPricesAction } from './actions';

export const metadata: Metadata = { title: 'Lower prices · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const VIEW_LABEL: Record<PriceReportView, string> = { open: 'To review', reviewed: 'Reviewed' };

/**
 * /admin/product-reports/lower-prices (and /in/admin/…): where shoppers say they saw this store's
 * products for less ("Tell us about a lower price"), by product: how many said so, the lowest
 * against the price now, and each report. An admin reprices (Edit listing) or not, and marks a
 * product's reports reviewed.
 */
export default async function AdminLowerPricesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/product-reports/lower-prices');
  if (!admin) return <AdminOnly store={store} />;

  const view = priceReportView(one(sp, 'view'));
  const result = await listPriceReportQueue(await db(), store.id, { view });
  const to = (path: string) => storePath(store, path);
  const viewHref = (v: PriceReportView) => to(`/admin/product-reports/lower-prices${v === 'open' ? '' : `?view=${v}`}`);
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const day = (iso: string) => new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const error = one(sp, 'error');
  const done = one(sp, 'done') === 'reviewed';
  const n = (v: number) => v.toLocaleString('en-US');
  const where = (r: PriceReport) =>
    r.seenAt === 'online' ? (
      <a href={r.url ?? '#'} rel="noopener noreferrer nofollow" target="_blank" className="text-ink underline underline-offset-2">{siteOf(r.url ?? '')}</a>
    ) : (
      <span>{[r.storeName, r.city].filter(Boolean).join(', ')}</span>
    );

  return (
    <AdminFrame
      store={store}
      path="/admin/product-reports/lower-prices"
      title="Lower prices"
      actions={<a href={to('/admin/product-reports')} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Product reports</a>}
      lede={<>Where shoppers say they saw a product for less, online or in a shop. Reprice it if you choose to match, then mark its reports reviewed; shoppers aren’t told either way.</>}
    >
      <AdminTabs
        label="Lower price views"
        tabs={(['open', 'reviewed'] as const).map((v) => ({ href: viewHref(v), label: `${VIEW_LABEL[v]} (${n(result.counts[v])})`, current: v === view }))}
      />
      {error ? <Alert tone="error">{messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert> : null}
      {!error && done ? <Alert tone="success">Marked reviewed.</Alert> : null}

      {result.products.length ? (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {result.products.map((p, i) => {
            const gap = p.priceMinor - p.lowestMinor;
            return (
              <li key={p.productId}>
                <article aria-labelledby={`lp-${i}`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      {p.archived ? (
                        <strong id={`lp-${i}`} className="line-clamp-2 text-[16px] font-semibold">{p.title} (archived)</strong>
                      ) : (
                        <a id={`lp-${i}`} href={to(`/product/${encodeURIComponent(p.productId)}`)} className="line-clamp-2 text-[16px] font-semibold text-ink underline-offset-2 hover:underline">{p.title}</a>
                      )}
                      <span className="text-[14px] text-ink-2">
                        Our price {money(p.priceMinor)} · lowest reported {money(p.lowestMinor)}
                        {gap > 0 ? <> ({money(gap)} less)</> : <> (not lower now)</>}
                      </span>
                    </div>
                    <span className="flex-none text-[13px] text-ink-3">{p.reports.length === 1 ? '1 report' : `${n(p.reports.length)} reports`}</span>
                  </div>
                  <table className="w-full border-collapse text-left text-[14px]">
                    <caption className="sr-only">Reports on {p.title}</caption>
                    <thead>
                      <tr className="text-[12px] uppercase tracking-[0.04em] text-ink-3">
                        <th scope="col" className="py-1.5 pr-3 font-semibold">Where</th>
                        <th scope="col" className="py-1.5 pr-3 font-semibold">Price</th>
                        <th scope="col" className="py-1.5 pr-3 font-semibold">Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.reports.map((r) => (
                        <tr key={r.id} className="border-t border-line-2 align-top">
                          <td className="py-2 pr-3">{where(r)}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {money(reportTotal(r))}
                            {r.shippingMinor ? <span className="block text-[12px] text-ink-3">incl. {money(r.shippingMinor)} delivery</span> : null}
                          </td>
                          <td className="py-2 pr-3 text-ink-2">
                            {r.seenOn ? day(r.seenOn) : adminTime(r.updatedAt, store)}
                            <span className="block text-[12px] text-ink-3">ours then {money(r.ourPriceMinor)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {view === 'open' ? (
                    <form action={reviewPricesAction.bind(null, p.productId)} className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line-2 pt-3">
                      {p.archived ? null : (
                        <a href={to(`/admin/products/${encodeURIComponent(p.productId)}`)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Edit listing</a>
                      )}
                      <button type="submit" className={buttonClasses({ variant: 'primary', size: 'sm' })}>Mark reviewed</button>
                    </form>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={view === 'open' ? 'Nothing to review.' : 'Nothing reviewed yet.'}>
          {view === 'open' ? 'When a shopper tells us about a lower price, the product shows up here.' : 'Products whose reports you mark reviewed show up here, latest first.'}
        </EmptyState>
      )}
    </AdminFrame>
  );
}
