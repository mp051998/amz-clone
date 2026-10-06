import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState, ProductFrame, SegmentedControl } from '@/components/decision';
import { Pagination } from '@/components/commerce/Pagination';
import { buttonClasses } from '@/components/primitives/Button';
import { OrdersTabs } from '@/components/orders/OrdersTabs';
import { StatusChip } from '@/components/orders/Tracking';
import { longDate, orderView } from '@/components/orders/format';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { listOrders } from '@/lib/data/orders';
import { filterOrders, orderSummary, periodOptions, periodPhrase, readOrderFilter, type OrderFilter } from '@/lib/order-filters';
import { returnSummaries } from '@/lib/data/returns';
import { RETURN_SUMMARY_CHIP } from '@/components/orders/Returns';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';

export const metadata: Metadata = { title: 'Orders · Store' };

const THUMBS = 4;

type SP = Record<string, string | string[] | undefined>;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const store = await getMarketplace();
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/orders'));
  const sp = (path: string) => storePath(store, path);
  const filter = readOrderFilter(await searchParams);
  const client = await db();
  const orders = await listOrders(client, store.id);
  const now = new Date();
  const view = filterOrders(orders, filter, now, store.dates.timeZone);
  // a search covers every order, so it sits under the Orders tab
  const tab = filter.q || filter.view === 'all' ? 'orders' : filter.view;
  const returns = await returnSummaries(client, view.items.filter((o) => o.deliveredAt).map((o) => o.id));
  /** this view with some of its params changed (the defaults left out of the link) */
  const hrefWith = (next: Partial<OrderFilter>) => {
    const f = { ...filter, page: 1, ...next };
    const qs = new URLSearchParams();
    if (f.q) qs.set('q', f.q);
    else if (f.view !== 'all') qs.set('view', f.view);
    else if (f.period !== 'months3') qs.set('period', f.period);
    if (f.page > 1) qs.set('page', String(f.page));
    const s = qs.toString();
    return sp(s ? `/orders?${s}` : '/orders');
  };

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Orders</h1>
          <span className="text-[15px] text-ink-2">Every order in this store, with live delivery progress.</span>
        </div>
        <OrdersTabs current={tab} href={sp} />

        {orders.length ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <form action={sp('/orders')} method="get" role="search" className="flex min-w-0 flex-[1_1_280px] max-w-[440px] items-stretch overflow-hidden rounded-input border-[1.5px] border-line-3 bg-surface focus-within:border-ink">
                <input
                  type="search"
                  name="q"
                  defaultValue={filter.q}
                  placeholder="Search all orders"
                  aria-label="Search all orders"
                  enterKeyHint="search"
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-[16px] text-ink outline-none placeholder:text-ink-4 md:text-[14px]"
                />
                <button type="submit" className="flex-none border-0 border-l border-line-3 bg-surface-2 px-3.5 text-[14px] font-semibold text-ink hover:bg-surface-4">
                  Search orders
                </button>
              </form>
              {filter.q || filter.view !== 'all' ? null : (
                <SegmentedControl
                  ariaLabel="Orders placed in"
                  value={filter.period}
                  options={periodOptions(orders, now, filter.period).map((o) => ({ ...o, href: hrefWith({ period: o.value }) }))}
                  className="max-w-full overflow-x-auto"
                />
              )}
            </div>
            <p className="m-0 text-[14px] text-ink-2" role="status">
              <strong className="font-semibold text-ink">{orderSummary(view.total, filter)}</strong>
              {filter.q ? (
                <>
                  {' · '}
                  <a href={hrefWith({ q: '', view: 'all' })} className="text-ink underline underline-offset-2">Clear search</a>
                </>
              ) : null}
            </p>
          </div>
        ) : null}

        {orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            action={<a href={sp('/')} className={buttonClasses({ variant: 'dark' })}>Start shopping</a>}
          >
            Orders you place show up here with a delivery timeline.
          </EmptyState>
        ) : view.total === 0 ? (
          <EmptyState
            title={
              filter.q
                ? `No orders match “${filter.q}”`
                : filter.view === 'not-shipped'
                  ? 'Nothing waiting to ship'
                  : filter.view === 'cancelled'
                    ? 'No cancelled orders'
                    : `No orders ${periodPhrase(filter.period)}`
            }
            action={<a href={hrefWith({ q: '', view: 'all', period: 'all' })} className={buttonClasses({ variant: 'secondary' })}>See all orders</a>}
          >
            {filter.q
              ? 'Search for an item, a seller, who it went to, or an order number.'
              : filter.view === 'not-shipped'
                ? 'Everything you’ve ordered is on its way or delivered.'
                : filter.view === 'cancelled'
                  ? 'Orders you or the store cancel show up here.'
                  : filter.period === 'archived'
                    ? 'Archive an order from its page to keep it out of your order list.'
                    : 'Older orders are under the other periods.'}
          </EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {view.items.map((o) => {
              const v = orderView(o, store, now);
              const extra = o.items.length - THUMBS;
              return (
                <li key={o.id} className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-[18px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap gap-1.5">
                      <StatusChip label={v.chip.label} tone={v.chip.tone} />
                      {returns.has(o.id) ? <StatusChip {...RETURN_SUMMARY_CHIP[returns.get(o.id)!]} /> : null}
                      {o.archivedAt ? <StatusChip label="Archived" tone="neutral" /> : null}
                    </span>
                    <span className="font-mono text-[12px] text-ink-3">{o.id}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3.5">
                    <div className="flex flex-none gap-2">
                      {o.items.slice(0, THUMBS).map((it) => (
                        <span key={it.productId} className="w-14" title={it.title}>
                          <ProductFrame src={it.image} alt={it.title} aspect="1/1" />
                        </span>
                      ))}
                      {extra > 0 ? (
                        <span className="flex h-14 w-14 items-center justify-center rounded-image bg-surface-2 font-mono text-[12px] text-ink-3">+{extra}</span>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                      <span className="line-clamp-1 text-[15px] font-semibold">
                        {o.items[0]?.title}
                        {o.items.length > 1 ? <span className="font-normal text-ink-3"> and {o.items.length - 1} more</span> : null}
                      </span>
                      <span className="text-[13px] text-ink-2">
                        Placed {longDate(new Date(o.placedAt ?? o.createdAt), store)} · {v.itemCount} {v.itemCount === 1 ? 'item' : 'items'} · to {o.shipTo.name}
                      </span>
                    </div>
                    <div className="flex flex-none items-center gap-3">
                      <strong className="text-[17px] tabular-nums">{formatMoney(o.totals.totalMinor, o.currency)}</strong>
                      {o.status === 'awaiting_payment' ? null : (
                        <a href={sp(`/orders/${encodeURIComponent(o.id)}/invoice`)} className="text-[14px] text-ink underline underline-offset-2" aria-label={`Invoice for order ${o.id}`}>
                          Invoice
                        </a>
                      )}
                      {o.status === 'awaiting_payment' ? (
                        <a href={sp(`/orders/${o.id}?placed=0`)} className={buttonClasses({ variant: 'primary' })} aria-label={`Complete payment for order ${o.id}`}>
                          Complete payment →
                        </a>
                      ) : (
                        <a href={sp(`/orders/${o.id}?placed=0`)} className={buttonClasses({ variant: 'secondary' })} aria-label={`Track order ${o.id}`}>
                          Track →
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {view.pageCount > 1 ? <Pagination page={view.page} pageCount={view.pageCount} hrefFor={(n) => hrefWith({ page: n })} /> : null}
      </div>
    </AppShell>
  );
}
