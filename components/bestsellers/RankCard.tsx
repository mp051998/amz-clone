import type { Product } from '@/lib/catalog';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { toStoreMinor } from '@/lib/fx';
import { Price } from '../primitives/Price';
import { Stars } from '../primitives/Stars';
import { addToCart } from '@/app/actions/cart';

/** Best Sellers card: big rank tab (#N) over the image, then title, stars, price, quick-add. */
export function RankCard({ product: p, store, rank }: { product: Product; store: Store; rank: number }) {
  const href = storePath(store, `/product/${p.id}`);
  const cur = store.currency.code;
  return (
    <article className="flex flex-col rounded-[8px] bg-white p-3 shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
      <div className="relative">
        <span className="absolute left-0 top-0 z-10 rounded-br-[8px] rounded-tl-[8px] bg-nav-main px-2.5 py-1 text-[15px] font-bold text-white">
          #{rank}
        </span>
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

      <a href={href} className="mt-2 line-clamp-2 text-[13px] leading-4 text-ink hover:text-link-hover hover:underline">{p.title}</a>
      <div className="mt-1"><Stars rating={p.rating} count={p.reviewCount} size={12} /></div>
      <div className="mt-1.5">
        <Price minor={toStoreMinor(p.priceMinor, cur, p.curBase)} currency={cur} size={20} />
      </div>
    </article>
  );
}
