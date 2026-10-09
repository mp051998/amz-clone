import { buttonClasses } from '../primitives/Button';

/** "Have one to sell? Sell on Store" under the product page's buy box, to the selling page. */
export function SellYours({ storeName, href }: { storeName: string; href: string }) {
  return (
    <p className="m-0 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line-2 pt-3 text-[14px] text-ink-2">
      Have one to sell?
      <a href={href} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
        Sell on {storeName}
      </a>
    </p>
  );
}
