import type { Product } from '@/lib/catalog';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { toStoreMinor } from '@/lib/fx';
import { Badge } from '../primitives/Badge';
import { Price } from '../primitives/Price';
import { Stars } from '../primitives/Stars';

function badgeFor(p: Product) {
  if (p.badge === "Amazon's Choice") return <Badge tone="choice">Amazon&apos;s Choice</Badge>;
  if (p.badge === 'Best Seller') return <span className="inline-block rounded-[4px] bg-[#C45500] px-1.5 py-0.5 text-[12px] text-white">#1 Best Seller</span>;
  if (p.badge === 'Bestseller') return <span className="inline-block rounded-[4px] bg-[#C45500] px-1.5 py-0.5 text-[12px] text-white">#1 Bestseller</span>;
  if (p.badge === 'Overall Pick') return <Badge tone="pick">Overall Pick</Badge>;
  if (p.badge === 'Limited time deal') return <span className="inline-block rounded-[4px] bg-price-deal px-1.5 py-0.5 text-[12px] font-bold text-white">Limited time deal</span>;
  return null;
}

/** One SRP list row: image | title/brand/rating/bought | price + deal + cart (design.md §5 SRP rows). */
export function SearchResultRow({ product: p, store }: { product: Product; store: Store }) {
  const href = storePath(store, `/product/${p.id}`);
  const cur = store.currency.code;
  const badge = badgeFor(p);
  return (
    <article className="flex gap-4 border-b border-line-3 py-5">
      <a href={href} className="flex h-[130px] w-[130px] shrink-0 items-center justify-center bg-white p-2 sm:h-[200px] sm:w-[200px]">
        <img src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" loading="lazy" />
      </a>
      <div className="min-w-0 flex-1">
        {badge ? <div className="mb-1">{badge}</div> : null}
        <a href={href} className="line-clamp-2 text-[18px] leading-6 text-ink hover:text-link-hover hover:underline">{p.title}</a>
        {p.brand ? (
          <a href={storePath(store, `/s?brand=${encodeURIComponent(p.brand)}`)} className="mt-0.5 block text-[14px] text-ink-2">
            Visit the <span className="text-link hover:text-link-hover hover:underline">{p.brand}</span> Store
          </a>
        ) : null}
        <div className="mt-1 flex items-center gap-2">
          <Stars rating={p.rating} count={p.reviewCount} href={`${href}#reviews`} size={16} />
        </div>
        {p.boughtPastMonth ? <p className="mt-1 text-[12px] text-ink-2">{p.boughtPastMonth}</p> : null}
        <div className="mt-1.5 flex items-baseline gap-2">
          {p.deal && p.dealPct ? <span className="rounded-[3px] bg-badge-deal px-1.5 py-0.5 text-[12px] font-bold text-white">-{p.dealPct}%</span> : null}
          <Price minor={toStoreMinor(p.priceMinor, cur, p.curBase)} currency={cur} listMinor={p.listMinor ? toStoreMinor(p.listMinor, cur, p.curBase) : undefined} size={22} />
        </div>
        {p.deal ? <p className="text-[12px] text-price-deal">Limited time deal</p> : null}
        <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-2">
          <span className="text-success-deep">FREE delivery</span>
          <span>Ships from {p.shipsFrom} · Sold by {p.seller}</span>
        </div>
        <a href={href} className="mt-3 inline-flex h-[32px] items-center rounded-pill bg-cta-yellow px-4 text-[13px] font-medium text-ink hover:bg-cta-yellow-hover">
          Add to cart
        </a>
      </div>
    </article>
  );
}
