import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/decision';
import { buttonClasses } from '@/components/primitives/Button';
import { pickupFromText, ReturnCard } from '@/components/orders/Returns';
import { shortDate } from '@/components/orders/format';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { listOrders } from '@/lib/data/orders';
import { getOrderReturns, ordersWithReturns, returnInProgress } from '@/lib/data/returns';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import type { Order, OrderReturn } from '@/lib/types';

export const metadata: Metadata = { title: 'Your returns · Store' };

/** Orders whose returns are listed, latest return first; older ones stay on their order's page. */
const ORDERS = 20;

interface Entry {
  r: OrderReturn;
  order: Order;
}

/**
 * /returns (and /in/returns), Amazon's returns centre: every return, replacement and refund on
 * the shopper's orders in this store, in progress first. Changing or cancelling one stays on
 * its order's page.
 */
export default async function ReturnsPage() {
  const store = await getMarketplace();
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/returns'));
  const sp = (path: string) => storePath(store, path);
  const client = await db();
  const [orders, withReturns] = await Promise.all([listOrders(client, store.id), ordersWithReturns(client)]);
  const byId = new Map(orders.map((o) => [o.id, o]));
  // the returns span both stores; keep this store's
  const ids = withReturns.filter((id) => byId.has(id)).slice(0, ORDERS);
  const found = await Promise.all(ids.map((id) => getOrderReturns(client, id).catch(() => null)));
  const now = new Date();
  const entries: Entry[] = ids
    .flatMap((id, i) => (found[i]?.returns ?? []).map((r) => ({ r, order: byId.get(id)! })))
    .sort((a, b) => Date.parse(b.r.createdAt) - Date.parse(a.r.createdAt));
  const open = entries.filter((e) => returnInProgress(e.r, now));
  const done = entries.filter((e) => !returnInProgress(e.r, now));

  const group = (id: string, title: string, list: Entry[]) =>
    list.length ? (
      <section aria-labelledby={id} className="flex flex-col gap-3">
        <h2 id={id} className="m-0 text-[18px] font-semibold">
          {title} <span className="font-normal text-ink-3">({list.length})</span>
        </h2>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {list.map(({ r, order }) => (
            <li key={r.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-ink-3">
                <span>
                  Order <span className="font-mono">{order.id}</span>
                  {order.placedAt ? ` · placed ${shortDate(new Date(order.placedAt), store)}` : ''}
                </span>
                <a
                  href={sp(`/orders/${encodeURIComponent(order.id)}?placed=0#returns-h`)}
                  aria-label={`View return details in order ${order.id}`}
                  className="text-ink underline underline-offset-2"
                >
                  View return details
                </a>
              </div>
              <ReturnCard
                r={r}
                currency={order.currency}
                market={order.market}
                method={order.paymentMethod}
                label={order.paymentLabel}
                store={store}
                now={now}
                pickupFrom={pickupFromText(order)}
              />
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Your returns</h1>
            <span className="text-[15px] text-ink-2">Returns, replacements and refunds on your orders in this store.</span>
          </div>
          <a href={sp('/orders')} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Return items from an order</a>
        </div>

        {entries.length ? (
          <>
            {group('returns-open', 'In progress', open)}
            {group('returns-done', 'Completed', done)}
          </>
        ) : (
          <EmptyState title="No returns" action={<a href={sp('/orders')} className={buttonClasses({ variant: 'dark' })}>Go to Your Orders</a>}>
            When you return or replace something, you can follow it here, from sending it back to the refund.
          </EmptyState>
        )}
      </div>
    </AppShell>
  );
}
