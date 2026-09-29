export interface StoreHintBannerProps {
  storeName: string;
  otherName: string;
  otherHref: string;
}

/** "You are shopping on X. Also available: Y" strip (design.md §5 Store switch). */
export function StoreHintBanner({ storeName, otherName, otherHref }: StoreHintBannerProps) {
  return (
    <div className="border-b border-line bg-surface-2 text-[13px] text-ink-2">
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-3 px-6 py-2">
        <span>You are shopping on <b className="text-ink">{storeName}</b>. Also available: <a className="text-ink underline underline-offset-2" href={otherHref}>{otherName}</a></span>
        <span className="font-mono text-[12px] text-ink-3">DEMO · NO REAL ORDERS</span>
      </div>
    </div>
  );
}
