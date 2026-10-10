import type { Metadata } from 'next';
import { EmptyState } from '@/components/decision/Badges';
import { Alert } from '@/components/primitives/Alert';
import { dealView, listAdminLightningDeals, type AdminLightningDeal, type DealEndReason, type DealView } from '@/lib/data/admin-lightning-deals';
import { messageFor } from '@/lib/data/errors';
import { dealOffPct } from '@/lib/lightning';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';
import { cancelDealAction } from '../actions';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Lightning Deals · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;

const ENDED: Record<DealEndReason, string> = {
  time: 'Ended at its time',
  sold_out: 'Sold out',
  repriced: 'Ended when the price changed',
  unavailable: 'Ended: off sale or out of stock',
  cancelled: 'Cancelled',
};

const EMPTY: Record<DealView, string> = {
  live: 'No Lightning Deals are live right now.',
  upcoming: 'No Lightning Deals are coming up.',
  ended: 'No Lightning Deals have ended yet.',
};

/**
 * /admin/deals (and /in/admin/deals): the store's Lightning Deals, as Seller Central's Deals page
 * lists them: live, upcoming and ended, each with its price, units claimed and times. A live deal
 * can be ended now and an upcoming one cancelled; deals are scheduled from a product's page.
 */
export default async function AdminDealsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { store, admin } = await adminPage('/admin/deals');
  if (!admin) return <AdminOnly store={store} />;

  const view = dealView(first(sp.view));
  const { deals, counts } = await listAdminLightningDeals(await db(), store.id, view);
  const to = (path: string) => storePath(store, path);
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const at = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: store.dates.timeZone });
  const when = (iso: string) => at.format(new Date(iso));
  const hours = (d: AdminLightningDeal) => Math.round((Date.parse(d.endsAt) - Date.parse(d.startsAt)) / 3_600_000);
  const problem = messageFor(first(sp.error));

  const timing = (d: AdminLightningDeal) =>
    view === 'live'
      ? `Ends ${when(d.endsAt)}`
      : view === 'upcoming'
        ? `Starts ${when(d.startsAt)} · ${hours(d)} ${hours(d) === 1 ? 'hour' : 'hours'}`
        : `${d.endReason ? ENDED[d.endReason] : 'Ended'} · ${when(d.endedAt ?? d.endsAt)}`;

  return (
    <AdminFrame
      store={store}
      path="/admin/deals"
      title="Lightning Deals"
      lede={
        <>
          Deals on this store’s products: the ones the store plans by itself, two an hour, and the ones admins schedule. Times are the store’s ({store.dates.timeZone}). To schedule a deal, open the product from{' '}
          <a href={to('/admin/products')} className="text-ink underline underline-offset-2">Products</a>.
        </>
      }
    >
      <AdminTabs
        label="Deals"
        tabs={[
          { href: to('/admin/deals'), label: `Live (${counts.live})`, current: view === 'live' },
          { href: to('/admin/deals?view=upcoming'), label: `Upcoming (${counts.upcoming})`, current: view === 'upcoming' },
          { href: to('/admin/deals?view=ended'), label: 'Ended', current: view === 'ended' },
        ]}
      />
      {problem ? <Alert tone="error">{problem}</Alert> : null}
      {first(sp.done) === 'deal_cancelled' ? <Alert tone="success">Deal cancelled. A live one ended now, and its product is back at its own price.</Alert> : null}

      {deals.length ? (
        <ol aria-label={`${view[0].toUpperCase()}${view.slice(1)} deals`} className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
          {deals.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 border-t border-line-2 px-4 py-3 first:border-t-0">
              {d.image ? <img src={d.image} alt="" width={48} height={48} className="h-12 w-12 flex-none rounded-[6px] object-contain" /> : null}
              <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                <a href={to(`/admin/products/${encodeURIComponent(d.productId)}#lightning-deal`)} className="line-clamp-2 text-[15px] text-ink underline underline-offset-2">
                  {d.title || d.productId}
                </a>
                <span className="text-[14px] tabular-nums">
                  <strong className="font-semibold">{money(d.dealPriceMinor)}</strong>
                  {d.wasPriceMinor != null && d.wasPriceMinor > d.dealPriceMinor ? (
                    <>
                      {' '}<s className="text-ink-3">{money(d.wasPriceMinor)}</s> · {dealOffPct(d.wasPriceMinor, d.dealPriceMinor)}% off
                    </>
                  ) : null}
                </span>
                <span className="text-[13px] text-ink-3">{timing(d)} · {d.byAdmin ? 'Scheduled by an admin' : 'Planned by the store'}</span>
              </div>
              <span className="flex-none text-right text-[14px] tabular-nums">
                {view === 'upcoming' ? `${d.quota} ${d.quota === 1 ? 'unit' : 'units'}` : `${d.claimed} of ${d.quota} claimed`}
              </span>
              {view === 'ended' ? null : (
                <form action={cancelDealAction.bind(null, d.id, view)}>
                  <SubmitButton variant="secondary" size="sm">
                    {view === 'live' ? 'End now' : 'Cancel'}
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title={EMPTY[view]}>
          {view === 'ended' ? 'Deals show here once they’re over.' : 'The store plans more every hour. You can also schedule one from a product’s page.'}
        </EmptyState>
      )}
    </AdminFrame>
  );
}
