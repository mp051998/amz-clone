import { ProductFrame } from '@/components/decision';
import type { Store } from '@/components/lib/store';
import { addToCart } from '@/app/actions/cart';
import type { Accessory } from '@/lib/decision/server';
import { shortTitle } from '@/lib/decision/verdict';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { SeeOptions } from '@/components/product/SeeOptions';

/** Add-ons that pair with what's in the cart or an order, one-tap Add each (hidden when empty). */
export function PairsWith({ items, store, id, title, note }: { items: Accessory[]; store: Store; id: string; title: string; note: string }) {
  if (!items.length) return null;
  const sp = (path: string) => storePath(store, path);
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="m-0 text-[20px] font-semibold">{title}</h2>
        <span className="text-[13px] text-ink-3">{note}</span>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 p-0">
        {items.map((a) => (
          <li key={a.product.id} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3.5">
            <a href={sp(`/product/${a.product.id}`)} className="w-[60px] flex-none" tabIndex={-1} aria-hidden>
              <ProductFrame src={a.product.image} alt="" aspect="1/1" />
            </a>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <a href={sp(`/product/${a.product.id}`)} className="line-clamp-2 text-[15px] font-semibold text-ink no-underline">{shortTitle(a.product.title, 6)}</a>
              <span className="text-[13px] text-ink-2">{a.reason}</span>
              <strong className="text-[15px] tabular-nums">{formatMoney(a.product.priceMinor, a.product.curBase)}</strong>
            </div>
            {a.product.sizes ? (
              <SeeOptions href={sp(`/product/${a.product.id}`)} name={a.product.title} className="flex-none" />
            ) : (
              <form action={addToCart} className="flex-none">
                <input type="hidden" name="id" value={a.product.id} />
                <input type="hidden" name="qty" value="1" />
                <button
                  type="submit"
                  aria-label={`Add ${a.product.title} to cart`}
                  className="min-h-11 rounded-pill border border-ink bg-surface px-3.5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-2"
                >
                  Add
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
