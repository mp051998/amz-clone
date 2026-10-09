import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState, ProductFrame, SegmentedControl } from '@/components/decision';
import { Pagination } from '@/components/commerce/Pagination';
import { buttonClasses } from '@/components/primitives/Button';
import { BuyAgainButton } from '@/components/orders/BuyAgainButton';
import { OrdersTabs } from '@/components/orders/OrdersTabs';
import { StatusChip } from '@/components/orders/Tracking';
import { longDate, orderView } from '@/components/orders/format';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { listOrders } from '@/lib/data/orders';
import { filterOrders, orderSummary, periodOptions, periodPhrase, readOrderFilter, type OrderFilter } from '@/lib/order-filters';
import { canStartReturn, getOrderReturns, returnSummaries, type OrderReturns } from '@/lib/data/returns';
import { feedbackOpen } from '@/lib/data/seller-feedback';
import { RETURN_SUMMARY_CHIP } from '@/components/orders/Returns';
import { getMarketplace } from '@/lib/marketplace-server';
import { orderStage } from '@/lib/decision/tracking';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';

export const metadata: Metadata = { title: 'Orders · Store' };

/** Items listed on an order's card; the rest are on the order's page. */
const ITEMS = 3;

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
  const delivered = view.items.filter((o) => o.status === 'placed' && orderView(o, store, now).delivered);
  const [returns, returnable] = await Promise.all([
    returnSummaries(client, view.items.filter((o) => o.deliveredAt).map((o) => o.id)),
    // "Return or replace items" on the orders still in their return window (the order's page has the rest)
    Promise.all(
      delivered.map((o) =>
        getOrderReturns(client, o.id)
          .then((r): [string, OrderReturns] | null => (r && canStartReturn(r, now) ? [o.id, r] : null))
          .catch(() => null),
      ),
    ).then((rows) => new Map(rows.filter((r) => r != null))),
  ]);
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
              const extra = o.items.length - ITEMS;
              const unpaid = o.status === 'awaiting_payment';
              const ret = returnable.get(o.id);
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
                  <span className="text-[13px] text-ink-2">
                    Placed {longDate(new Date(o.placedAt ?? o.createdAt), store)} · {v.itemCount} {v.itemCount === 1 ? 'item' : 'items'} · to {o.shipTo.name}
                  </span>
                  {/* under the status, as Amazon's card says: where it was left, when it comes, or the refund */}
                  {v.window && !unpaid ? <span className="text-[14px] text-ink">{v.window}</span> : null}
                  {o.deliveryOtp && orderStage(o, now, store.dates.timeZone) === 'out_for_delivery' ? (
                    <span className="text-[13px] text-ink">
                      Delivery OTP <strong className="font-mono font-semibold tracking-[0.15em]">{o.deliveryOtp}</strong>
                      <span className="text-ink-2"> · share it with the delivery associate</span>
                    </span>
                  ) : null}
                  <div className="flex flex-wrap items-start gap-4">
                    <ul className="m-0 flex min-w-0 flex-[1_1_360px] list-none flex-col gap-3 p-0" aria-label={`Items in order ${o.id}`}>
                      {o.items.slice(0, ITEMS).map((it) => {
                        // bought from another seller: buy and view the product (from whoever sells it on its page)
                        const pid = it.offerOf ?? it.productId;
                        const href = sp(`/product/${encodeURIComponent(pid)}`);
                        return (
                          <li key={`${it.productId}:${it.size ?? ''}`} className="flex gap-3">
                            <a href={href} tabIndex={-1} aria-hidden className="w-16 flex-none">
                              <ProductFrame src={it.image} alt="" aspect="1/1" />
                            </a>
                            <div className="flex min-w-0 flex-col gap-1">
                              <a href={href} className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink no-underline hover:underline">
                                {it.title}
                              </a>
                              {it.qty > 1 || it.size ? (
                                <span className="text-[13px] text-ink-2">{[it.qty > 1 ? `Qty ${it.qty}` : null, it.size ? `Size ${it.size}` : null].filter(Boolean).join(' · ')}</span>
                              ) : null}
                              {unpaid ? null : (
                                <span className="flex flex-wrap items-center gap-3">
                                  <BuyAgainButton productId={pid} title={it.title} size={it.size} />
                                  <a href={href} className="text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink" aria-label={`View your item: ${it.title}`}>
                                    View your item
                                  </a>
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                      {extra > 0 ? (
                        <li>
                          <a href={sp(`/orders/${encodeURIComponent(o.id)}?placed=0`)} className="text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink">
                            and {extra} more {extra === 1 ? 'item' : 'items'} in this order
                          </a>
                        </li>
                      ) : null}
                    </ul>
                    <div className="flex w-full flex-col gap-2 sm:w-[230px] sm:flex-none">
                      <span className="flex items-center justify-between gap-3">
                        <strong className="text-[17px] tabular-nums">{formatMoney(o.totals.totalMinor, o.currency)}</strong>
                        {unpaid ? null : (
                          <a href={sp(`/orders/${encodeURIComponent(o.id)}/invoice`)} className="text-[14px] text-ink underline underline-offset-2" aria-label={`Invoice for order ${o.id}`}>
                            Invoice
                          </a>
                        )}
                      </span>
                      {unpaid ? (
                        <a href={sp(`/orders/${o.id}?placed=0`)} className={buttonClasses({ variant: 'primary', block: true })} aria-label={`Complete payment for order ${o.id}`}>
                          Complete payment →
                        </a>
                      ) : (
                        <a href={sp(`/orders/${o.id}?placed=0`)} className={buttonClasses({ variant: 'secondary', block: true })} aria-label={`Track order ${o.id}`}>
                          Track package
                        </a>
                      )}
                      {/* Amazon's order-card buttons: cancel before it ships, gift receipt, seller feedback after delivery */}
                      {o.status === 'placed' && v.cancelUntil ? (
                        <a href={sp(`/orders/${encodeURIComponent(o.id)}/cancel`)} className={buttonClasses({ variant: 'secondary', block: true })} aria-label={`Cancel items in order ${o.id}`}>
                          Cancel items
                        </a>
                      ) : null}
                      {ret ? (
                        <a href={sp(`/orders/${encodeURIComponent(o.id)}/return`)} className={buttonClasses({ variant: 'secondary', block: true })}>
                          {Object.values(ret.replaceable).some((n) => n > 0) ? 'Return or replace items' : 'Return items'}
                        </a>
                      ) : null}
                      {o.status === 'placed' ? (
                        <a href={sp(`/orders/${encodeURIComponent(o.id)}/gift-receipt`)} className={buttonClasses({ variant: 'secondary', block: true })} aria-label={`Share gift receipt for order ${o.id}`}>
                          Share gift receipt
                        </a>
                      ) : null}
                      {feedbackOpen(o, now) ? (
                        <a href={sp(`/orders/${encodeURIComponent(o.id)}?placed=0#seller-feedback`)} className={buttonClasses({ variant: 'secondary', block: true })} aria-label={`Leave seller feedback for order ${o.id}`}>
                          Leave seller feedback
                        </a>
                      ) : null}
                      {delivered.includes(o) ? (
                        <a href={sp('/account/reviews')} className={buttonClasses({ variant: 'secondary', block: true })}>
                          Write a product review
                        </a>
                      ) : null}
                      {unpaid ? null : (
                        <a href={sp(`/customer-service/contact?order=${encodeURIComponent(o.id)}`)} className={buttonClasses({ variant: 'secondary', block: true })} aria-label={`Problem with order ${o.id}`}>
                          Problem with order
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
