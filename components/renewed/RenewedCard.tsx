import type { RenewedOffer } from '@/lib/data/renewed';
import { toStoreMinor } from '@/lib/fx';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { savingOnNew } from '@/lib/renewed';
import type { Store } from '../lib/store';
import { BuyAgainButton } from '../orders/BuyAgainButton';
import { Price } from '../primitives/Price';
import { ProductFrame } from '../decision/ProductFrame';

/**
 * A renewed offer on the Renewed storefront: the product (frame, name), the renewed price against
 * what it costs new and the saving, what the seller says about its condition, who sells it, and
 * its own add to cart. The name goes to the product's renewed buying options.
 */
export function RenewedCard({ item, store, guarantee }: { item: RenewedOffer; store: Store; guarantee: string | null }) {
  const { offer, product } = item;
  const href = storePath(store, `/product/${encodeURIComponent(product.id)}/offers?condition=renewed`);
  const cur = store.currency.code;
  const price = toStoreMinor(offer.priceMinor, cur, offer.curBase);
  const fresh = toStoreMinor(product.priceMinor, cur, product.curBase);
  const saving = savingOnNew(price, fresh);
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 transition-colors hover:border-ink">
      <div className="flex items-stretch gap-3.5">
        <div className="relative w-[104px] flex-none">
          <a href={href} tabIndex={-1} aria-hidden className="block">
            <ProductFrame src={product.image} alt="" aspect="4/5" inset="10%" />
          </a>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {saving ? (
            <span className="self-start rounded-tag bg-good-bg px-[7px] py-[3px] text-[13px] font-bold leading-none text-good-strong">Save {saving.pct}%</span>
          ) : null}
          <a href={href} className="line-clamp-2 text-[15px] font-semibold leading-tight text-ink no-underline hover:text-accent-ink">
            {product.title}
          </a>
          <Price minor={price} currency={cur} showSavings={false} size={18} />
          <span className="text-[13px] text-ink-2">New: {formatMoney(fresh, cur)}</span>
          <span className="text-[13px]">
            <span className="font-semibold">Renewed</span>
            {offer.conditionNote ? <span className="text-ink-2"> — {offer.conditionNote}</span> : null}
          </span>
          <span className="text-[13px] text-ink-2">Sold by {offer.seller}</span>
          {guarantee ? <span className="text-[13px] text-ink-2">{guarantee}</span> : null}
        </div>
      </div>
      <div className="border-t border-line-2 pt-2">
        <BuyAgainButton productId={offer.id} title={`${product.title}, Renewed from ${offer.seller}`} label="Add to cart" block />
      </div>
    </article>
  );
}
