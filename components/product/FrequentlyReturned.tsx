import type { FrequentReturns, ProductReturnReason } from '@/lib/data/return-signal';

const BECAUSE: Record<ProductReturnReason, string> = {
  damaged: 'it arrived damaged',
  defective: 'it was defective or didn’t work',
  wrong_item: 'they were sent the wrong item',
  missing_parts: 'parts or accessories were missing',
  not_as_described: 'it wasn’t as described',
};

/** Amazon's "Frequently returned item" note under the title, with the usual reason when there is one. */
export function FrequentlyReturned({ signal, reviewsHref }: { signal: FrequentReturns; reviewsHref: string }) {
  return (
    <div role="note" aria-labelledby="returned-h" className="flex flex-col gap-0.5 self-start rounded-input border border-warn-strong/40 bg-surface-2 px-3 py-2 text-[13px] leading-snug">
      <strong id="returned-h" className="font-semibold text-warn-strong">Frequently returned item</strong>
      <span className="text-ink-2">
        {signal.reason ? `Customers who return it usually say ${BECAUSE[signal.reason]}. ` : null}
        Check the product details and{' '}
        <a href={reviewsHref} className="text-ink underline underline-offset-2">customer reviews</a> before you buy.
      </span>
    </div>
  );
}

/** Amazon's "Customers usually keep this item" note under the title: few of them come back. */
export function UsuallyKept() {
  return (
    <div role="note" aria-label="Customers usually keep this item" className="inline-flex items-center gap-1.5 self-start text-[13px] leading-snug">
      <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" className="shrink-0 text-good-strong">
        <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <strong className="font-semibold text-good-strong">Customers usually keep this item</strong>
    </div>
  );
}
