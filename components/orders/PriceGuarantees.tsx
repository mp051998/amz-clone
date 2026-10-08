import { formatMoney } from '@/lib/marketplaces';
import type { Order, OrderCancellation, PriceGuarantee } from '@/lib/types';
import { StatusChip } from './Tracking';
import { cancellationRefundText, shortDate, type ChipTone, type StoreDates } from './format';

/**
 * "Pre-order Price Guarantee" on an order: each time a pre-ordered item's price dropped before the
 * end of its release day, the lower price it now costs and the difference back.
 */

type Honored = OrderCancellation & { priceGuarantee: PriceGuarantee };

export function priceGuarantees(order: Pick<Order, 'cancellations'>): Honored[] {
  return (order.cancellations ?? []).filter((c): c is Honored => c.priceGuarantee != null);
}

export function priceGuaranteeChip(c: OrderCancellation): { label: string; tone: ChipTone } {
  switch (c.refund.status) {
    case 'succeeded':
      return { label: 'Refunded', tone: 'neutral' };
    case 'failed':
      return { label: 'Refund delayed', tone: 'dark' };
    case 'pending':
      return { label: 'Refund processing', tone: 'warn' };
    default:
      return { label: 'Price lowered', tone: 'neutral' };
  }
}

export function PriceGuarantees({ order, store, href }: { order: Order; store: StoreDates; href: (productId: string) => string }) {
  const honored = priceGuarantees(order);
  if (!honored.length) return null;
  const money = (minor: number) => formatMoney(minor, order.currency);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="price-guarantee-h">
      <h2 id="price-guarantee-h" className="m-0 text-[16px] font-semibold">Pre-order Price Guarantee</h2>
      {honored.map((c) => {
        const g = c.priceGuarantee;
        return (
          <article key={c.id} aria-label="Price drop" className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] pt-4">
              <StatusChip {...priceGuaranteeChip(c)} />
              <span className="text-[13px] text-ink-3">Price dropped {shortDate(new Date(c.createdAt), store)}</span>
            </div>
            <p className="m-0 px-[18px] py-3 text-[14px] leading-[1.5]">
              <a href={href(g.productId)} className="font-semibold text-ink-2 no-underline">{g.title}</a> dropped to {money(g.priceMinor)} before its release, so you pay the lower price:{' '}
              {money(c.itemsMinor)} less{g.qty > 1 ? ` for ${g.qty} items` : ''}.
            </p>
            <p className="m-0 border-t border-line-2 px-[18px] py-3 text-[14px] leading-[1.5] text-ink-2">
              {c.refund.status === 'not_charged'
                ? `You’ll pay ${money(c.refund.amountMinor)} less when it arrives.`
                : cancellationRefundText(order, c, store)}
              {c.taxMinor ? <span className="text-ink-3"> Includes {money(c.taxMinor)} tax.</span> : null}
            </p>
          </article>
        );
      })}
    </section>
  );
}
