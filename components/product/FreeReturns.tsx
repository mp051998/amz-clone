import { IconClose } from '@/components/icons';

/**
 * amazon.com's "FREE Returns" under the price, opening a note on how the free return works (a
 * native popover, so no script). `until` is the later return-by date in the holiday season.
 */
export function FreeReturns({ days, until }: { days: number; until?: string | null }) {
  return (
    <div>
      <button
        type="button"
        popoverTarget="free-returns"
        className="inline-flex min-h-8 items-center gap-1 text-[14px] font-semibold text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        FREE Returns <span aria-hidden className="text-[12px]">▾</span>
      </button>
      <div
        id="free-returns"
        popover="auto"
        role="dialog"
        aria-label="Return this item for free"
        className="m-auto w-[min(380px,calc(100vw-32px))] rounded-card border border-line bg-surface p-4 text-ink shadow-lg backdrop:bg-scrim"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="m-0 text-[15px] font-semibold">Return this item for free</p>
          <button type="button" popoverTarget="free-returns" popoverTargetAction="hide" aria-label="Close" className="-m-1 rounded-full p-1 text-ink-2 hover:text-ink">
            <IconClose width={18} height={18} />
          </button>
        </div>
        <ul className="m-0 mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[14px] text-ink-2">
          <li>{until ? `Return it by ${until} (holiday returns) for a full refund.` : `Return it within ${days} days of delivery for a full refund.`}</li>
          <li>Start the return from Your Orders and print the prepaid label: there’s nothing to pay to send it back.</li>
          <li>Drop the package off, and the refund goes to your original payment method once it arrives.</li>
        </ul>
      </div>
    </div>
  );
}
