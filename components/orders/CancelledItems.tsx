import { ProductFrame } from '@/components/decision';
import { formatMoney } from '@/lib/marketplaces';
import type { Order, OrderCancellation } from '@/lib/types';
import { StatusChip } from './Tracking';
import { cancellationRefundText, shortDate, type ChipTone, type StoreDates } from './format';

/** "Cancelled items" on an order: what was cancelled before it shipped, and its refund. */

export function cancellationChip(c: OrderCancellation): { label: string; tone: ChipTone } {
  switch (c.refund.status) {
    case 'succeeded':
      return { label: 'Cancelled · refunded', tone: 'neutral' };
    case 'failed':
      return { label: 'Refund delayed', tone: 'dark' };
    case 'pending':
      return { label: 'Refund processing', tone: 'warn' };
    default:
      return { label: 'Cancelled', tone: 'neutral' };
  }
}

export function CancelledItems({ order, store, href }: { order: Order; store: StoreDates; href: (productId: string) => string }) {
  const cancellations = order.cancellations ?? [];
  if (!cancellations.length) return null;
  const money = (minor: number) => formatMoney(minor, order.currency);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="cancelled-items-h">
      <h2 id="cancelled-items-h" className="m-0 text-[16px] font-semibold">Cancelled items</h2>
      {cancellations.map((c) => (
        <article key={c.id} aria-label="Cancelled items" className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] pt-4">
            <StatusChip {...cancellationChip(c)} />
            <span className="text-[13px] text-ink-3">Cancelled {shortDate(new Date(c.createdAt), store)}</span>
          </div>
          {c.items.map((it) => (
            <div key={it.productId} className="flex items-center gap-3.5 px-[18px] py-3">
              <a href={href(it.productId)} className="w-12 flex-none" tabIndex={-1} aria-hidden>
                <ProductFrame src={it.image} alt="" aspect="1/1" />
              </a>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <a href={href(it.productId)} className="line-clamp-2 text-[14px] font-semibold text-ink-2 no-underline">{it.title}</a>
                <span className="text-[13px] text-ink-3">Qty {it.qty}</span>
              </div>
              <span className="flex-none text-[14px] tabular-nums text-ink-3 line-through">{money((it.unitPriceMinor - (it.unitDiscountMinor ?? 0)) * it.qty)}</span>
            </div>
          ))}
          <p className="m-0 border-t border-line-2 px-[18px] py-3 text-[14px] leading-[1.5] text-ink-2">
            {cancellationRefundText(order, c, store)}
            {c.taxMinor ? <span className="text-ink-3"> Includes {money(c.taxMinor)} tax.</span> : null}
          </p>
        </article>
      ))}
    </section>
  );
}
