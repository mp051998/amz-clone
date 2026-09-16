import type { Product } from '@/lib/catalog';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { toStoreMinor } from '@/lib/fx';
import { Price } from '../primitives/Price';
import { Stars } from '../primitives/Stars';
import { addToCart } from '@/app/actions/cart';

/** deterministic "% claimed" from the id so the bar is stable across renders. */
function claimedPct(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 38 + (h % 58); // 38–95%
}

/** Today's-Deals card: image + quick-add, % off, claimed bar, brand deals link (design.md §5 Deals). */
export function DealCard({ product: p, store }: { product: Product; store: Store }) {
  const href = storePath(store, `/product/${p.id}`);
  const cur = store.currency.code;
  const claimed = claimedPct(p.id);
  return (
    <article className="flex flex-col rounded-[8px] bg-white p-3 shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
      <div className="relative">
        <a href={href} className="flex h-[190px] items-center justify-center bg-white p-2">
          <img src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" loading="lazy" />
        </a>
        <form action={addToCart} className="absolute bottom-0 right-0">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="qty" value="1" />
          <button type="submit" aria-label={`Add ${p.title} to cart`} className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-[22px] leading-none text-ink shadow-md hover:bg-surface-2">
            +
          </button>
        </form>
      </div>

      {p.dealPct ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-[4px] bg-badge-deal px-2 py-0.5 text-[15px] font-bold text-white">{p.dealPct}% off</span>
          <span className="text-[13px] font-bold text-price-deal">Limited time deal</span>
        </div>
      ) : null}

      <div className="mt-2">
        <Price minor={toStoreMinor(p.priceMinor, cur)} currency={cur} listMinor={p.listMinor ? toStoreMinor(p.listMinor, cur) : undefined} size={22} />
      </div>

      <div className="mt-1.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full bg-[#FF6138]" style={{ width: `${claimed}%` }} />
        </div>
        <p className="mt-0.5 text-[12px] font-bold text-ink">{claimed}% claimed</p>
      </div>

      <a href={href} className="mt-1.5 line-clamp-2 text-[13px] leading-4 text-ink hover:text-link-hover hover:underline">{p.title}</a>
      <div className="mt-1"><Stars rating={p.rating} count={p.reviewCount} size={12} /></div>
      <a href={storePath(store, `/s?dept=${p.category}&deal=1`)} className="mt-2 text-[13px] text-link-teal hover:text-brand-count hover:underline">
        Shop {p.brand ?? 'more'} deals
      </a>
    </article>
  );
}
