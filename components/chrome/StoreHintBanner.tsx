export interface StoreHintBannerProps {
  storeName: string;
  otherName: string;
  otherHref: string;
}

/** "You are shopping on X. Also available: Y" strip (design.md §13 / SCOPE §3 store switch). */
export function StoreHintBanner({ storeName, otherName, otherHref }: StoreHintBannerProps) {
  return (
    <div className="border-b border-line bg-surface-2 text-[13px]">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-2">
        <span>You are shopping on <b>{storeName}</b>. Also available: <a className="text-link underline hover:text-link-hover" href={otherHref}>{otherName}</a></span>
        <span className="text-ink-2">Exploration build · presentable clone · no real orders</span>
      </div>
    </div>
  );
}
