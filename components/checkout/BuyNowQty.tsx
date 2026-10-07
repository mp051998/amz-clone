import { buyNowQuery } from '@/lib/buy-now';

/** The most Buy Now offers, as on the product page. */
export const BUY_NOW_MAX = 10;

/**
 * −/+ quantity for Buy Now's one line at checkout. Each step is a link that reopens checkout
 * at the new quantity (no JS, and nothing typed into the order form travels in the URL).
 * Stops at 1 and at the stock on hand, capped at BUY_NOW_MAX; when there's less stock than
 * the quantity asked for, − stays open so it can come back down. A protection plan stays on.
 */
export function BuyNowQty({
  checkoutHref,
  productId,
  qty,
  stock,
  name,
  protection,
}: {
  checkoutHref: string;
  productId: string;
  qty: number;
  stock: number;
  name: string;
  protection?: boolean;
}) {
  const max = Math.min(BUY_NOW_MAX, Math.max(stock, 1));
  const at = (n: number) => `${checkoutHref}?${buyNowQuery({ productId, qty: n, protection })}`;
  const btn = 'flex h-9 w-9 items-center justify-center bg-surface text-[17px] leading-none text-ink no-underline transition-colors hover:bg-surface-2 hover:text-ink';
  const off = 'flex h-9 w-9 items-center justify-center bg-surface text-[17px] leading-none text-ink-4 cursor-not-allowed';
  const step = (to: number, label: string, glyph: string, ok: boolean) =>
    ok ? (
      <a href={at(to)} className={btn} aria-label={label}>{glyph}</a>
    ) : (
      <span className={off} role="link" aria-disabled="true" aria-label={label}>{glyph}</span>
    );
  return (
    <span className="mt-1.5 inline-flex items-center overflow-hidden rounded-pill border border-line-3" role="group" aria-label={`Quantity ${name}`}>
      {step(Math.min(qty - 1, max), `Decrease quantity ${name}`, '−', qty > 1)}
      <span className="min-w-7 text-center text-[14px] font-semibold tabular-nums" aria-live="polite">
        <span className="sr-only">Quantity </span>{qty}
      </span>
      {step(qty + 1, `Increase quantity ${name}`, '+', qty < max)}
    </span>
  );
}
