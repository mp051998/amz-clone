import type { Product } from '@/lib/catalog';
import { addToCart, buyNow } from '@/app/actions/cart';
import { Price } from '../primitives/Price';
import { IconLock } from '../icons/index';

export interface BuyPanelProps {
  product: Product;
  /** free-delivery date, e.g. "Tue, Sep 19" */
  promise: string;
  /** fastest date, e.g. "Tomorrow" */
  fastest: string;
}

/** PDP buy box — server-action form: qty + Add to Cart + Buy Now (design.md §5 Buy box). */
export function BuyPanel({ product: p, promise, fastest }: BuyPanelProps) {
  return (
    <div className="w-full rounded-[8px] border border-line p-[14px] text-[14px] text-ink lg:w-[260px]">
      <div className="flex items-baseline gap-2">
        {p.deal && p.dealPct ? <span className="text-[20px] text-price-deal">-{p.dealPct}%</span> : null}
        <Price minor={p.priceMinor} currency="USD" listMinor={p.listMinor} size={28} />
      </div>
      {p.listMinor ? (
        <p className="mt-1 text-[12px] text-ink-2">
          List Price: <s>{`$${(p.listMinor / 100).toFixed(2)}`}</s>
        </p>
      ) : null}

      <p className="mt-3 text-[14px]">
        FREE delivery <b>{promise}</b>
      </p>
      <p className="text-[13px] text-ink-2">
        Or fastest delivery <b className="text-ink">{fastest}</b>
      </p>

      <p className="mt-3 text-[18px] font-medium text-success">In Stock</p>

      <form action={addToCart} className="mt-3 space-y-2">
        <input type="hidden" name="id" value={p.id} />
        <label className="flex items-center gap-2 text-[13px]">
          <span className="sr-only">Quantity</span>
          <select name="qty" defaultValue="1" className="h-[30px] rounded-[8px] border border-line-2 bg-surface-2 px-2 text-[13px] shadow-input">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>Qty: {n}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-[33px] w-full rounded-pill bg-cta-yellow text-[14px] font-medium text-ink shadow-input hover:bg-cta-yellow-hover">
          Add to Cart
        </button>
        <button type="submit" formAction={buyNow} className="h-[33px] w-full rounded-pill bg-cta-orange text-[14px] font-medium text-ink shadow-input hover:bg-cta-orange-hover">
          Buy Now
        </button>
      </form>

      <div className="mt-3 flex items-center gap-1 text-[12px] text-link-teal">
        <IconLock width={13} height={13} /> Secure transaction
      </div>
      <dl className="mt-3 space-y-1 text-[12px]">
        <div className="flex justify-between"><dt className="text-ink-2">Ships from</dt><dd>{p.shipsFrom}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-2">Sold by</dt><dd className="text-link-teal">{p.seller}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-2">Returns</dt><dd className="text-right text-link-teal">30-day refund</dd></div>
      </dl>
    </div>
  );
}
