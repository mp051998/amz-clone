import { releaseDate, type StoreDates } from '@/components/orders/format';
import type { LastPurchase } from '@/lib/data/buy-again';

/** Amazon's "You last purchased this item on September 3, 2026. View this order" at the top of the product page. */
export function LastPurchased({ last, orderHref, store }: { last: LastPurchase; orderHref: string; store: StoreDates }) {
  return (
    <p role="note" aria-label="Your last purchase" className="m-0 flex flex-wrap items-baseline gap-x-2 rounded-input border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] leading-snug">
      <span>
        You last purchased this item on <strong className="font-semibold">{releaseDate(new Date(last.at), store)}</strong>.
      </span>
      <a href={orderHref} className="text-ink underline underline-offset-2">View this order</a>
    </p>
  );
}
