import type { CouponOffer } from '@/lib/data/coupons';
import { couponUnitSavings } from '@/lib/data/coupons';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { toStoreMinor } from '@/lib/fx';
import type { Store } from '../lib/store';
import { Price } from '../primitives/Price';
import { ProductFrame } from '../decision/ProductFrame';
import { CouponToggle } from './CouponToggle';

/**
 * A coupon on the coupons page: the product (frame, "Save N%" tag, name, price, rating) with the
 * apply checkbox underneath. Applying here is the same as on the product page.
 */
export function CouponCard({ offer, store, signedIn }: { offer: CouponOffer; store: Store; signedIn: boolean }) {
  const { product: p, percentOff } = offer;
  const href = storePath(store, `/product/${p.id}`);
  const cur = store.currency.code;
  const price = toStoreMinor(p.priceMinor, cur, p.curBase);
  const list = p.listMinor ? toStoreMinor(p.listMinor, cur, p.curBase) : undefined;
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 transition-colors hover:border-ink">
      <div className="flex items-stretch gap-3.5">
        <div className="relative w-[104px] flex-none">
          <a href={href} tabIndex={-1} aria-hidden className="block">
            <ProductFrame src={p.image} alt="" aspect="4/5" inset="10%" />
          </a>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="self-start rounded-tag bg-good-bg px-[7px] py-[3px] text-[13px] font-bold leading-none text-good-strong">Save {percentOff}%</span>
          <a href={href} className="line-clamp-2 text-[15px] font-semibold leading-tight text-ink no-underline hover:text-accent-ink">
            {p.title}
          </a>
          <Price minor={price} currency={cur} listMinor={list} showSavings={false} size={18} />
          <span className="text-[13px] text-ink-2">
            <span aria-hidden className="text-star">★</span> {p.rating.toFixed(1)}
            <span className="text-ink-3"> · {p.reviewCount.toLocaleString(store.locale.default)} ratings</span>
          </span>
          {p.stock <= 0 ? <span className="text-[13px] font-semibold text-warn">Currently unavailable</span> : null}
        </div>
      </div>
      <div className="border-t border-line-2 pt-2">
        <CouponToggle
          productId={p.id}
          percentOff={percentOff}
          clipped={offer.clipped}
          signedIn={signedIn}
          market={store.id}
          savingText={formatMoney(couponUnitSavings(price, percentOff), cur)}
          next="/coupons"
          signinHint={false}
        />
      </div>
    </article>
  );
}
