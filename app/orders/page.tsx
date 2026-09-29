import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState, ProductFrame } from '@/components/decision';
import { buttonClasses } from '@/components/primitives/Button';
import { StatusChip } from '@/components/orders/Tracking';
import { longDate, orderView } from '@/components/orders/format';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { listOrders } from '@/lib/data/orders';
import { returnSummaries, type ReturnSummary } from '@/lib/data/returns';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';

export const metadata: Metadata = { title: 'Orders · Store' };

const THUMBS = 4;

const RETURN_CHIP: Record<ReturnSummary, { label: string; tone: 'good' | 'warn' }> = {
  requested: { label: 'Return started', tone: 'warn' },
  refund_pending: { label: 'Return received', tone: 'warn' },
  refunded: { label: 'Return refunded', tone: 'good' },
};

export default async function OrdersPage() {
  const store = await getMarketplace();
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/orders'));
  const sp = (path: string) => storePath(store, path);
  const client = await db();
  const orders = await listOrders(client, store.id);
  const returns = await returnSummaries(client, orders.filter((o) => o.deliveredAt).map((o) => o.id));
  const now = new Date();

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Orders</h1>
          <span className="text-[15px] text-ink-2">Every order in this store, with live delivery progress.</span>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            action={<a href={sp('/')} className={buttonClasses({ variant: 'dark' })}>Start shopping</a>}
          >
            Orders you place show up here with a delivery timeline.
          </EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {orders.map((o) => {
              const v = orderView(o, store, now);
              const extra = o.items.length - THUMBS;
              return (
                <li key={o.id} className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-[18px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap gap-1.5">
                      <StatusChip label={v.chip.label} tone={v.chip.tone} />
                      {returns.has(o.id) ? <StatusChip {...RETURN_CHIP[returns.get(o.id)!]} /> : null}
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
                      <a href={sp(`/orders/${o.id}?placed=0`)} className={buttonClasses({ variant: 'secondary' })} aria-label={`Track order ${o.id}`}>
                        Track →
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
