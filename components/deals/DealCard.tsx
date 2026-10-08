import type { LightningDeal, Product } from '@/lib/types';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { toStoreMinor } from '@/lib/fx';
import { formatMoney } from '@/lib/marketplaces';
import { inEarlyAccess } from '@/lib/lightning';
import { memberDealLabel, memberPrice } from '@/lib/member-deals';
import { MemberDealTag } from '../product/MemberDeal';
import { Price } from '../primitives/Price';
import { ProductFrame } from '../decision/ProductFrame';
import { CompareToggle } from '../decision/Compare';
import { SaveButton } from '../decision/SaveButton';
import { LightningDealInfo } from './LightningDeal';
import { QuickAdd } from './QuickAdd';
import { WatchDeal } from './WatchDeal';

/**
 * Deal card after the prototype's "Deals for you" card (design-import … ~line 124): hatched frame on the
 * left, accent "N% off" tag, name, price with struck list/M.R.P., ★ rating; Compare + Save underneath.
 * No fake urgency — the saving itself is the reason it's here (design.md §12). The only timer and
 * claimed bar are a `lightning` deal's own: its real end and units. An upcoming one offers "Watch
 * this deal" in place of adding it at today's price, except to a `member` in its early access, who
 * can buy it at the deal price already.
 */
export function DealCard({ product: p, store, saved = false, lightning, watching = false, member = false }: {
  product: Product;
  store: Store;
  saved?: boolean;
  lightning?: LightningDeal;
  /** whether the viewer watches its upcoming `lightning` deal */
  watching?: boolean;
  /** whether the viewer is a member, who can buy an upcoming deal in its early access */
  member?: boolean;
}) {
  const href = storePath(store, `/product/${p.id}`);
  const cur = store.currency.code;
  const price = toStoreMinor(p.priceMinor, cur, p.curBase);
  const list = p.listMinor ? toStoreMinor(p.listMinor, cur, p.curBase) : undefined;
  const pct = p.dealPct ?? (list && list > price ? Math.round((1 - price / list) * 100) : 0);
  const early = { membership: store.membership.name, member, joinHref: storePath(store, '/prime') };
  // a member in its early access buys it now; anyone else watches for its start
  const watch = lightning?.state === 'upcoming' && !(member && inEarlyAccess(lightning));
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 transition-colors hover:border-ink">
      <div className="flex items-stretch gap-3.5">
        <div className="relative w-[104px] flex-none">
          <a href={href} tabIndex={-1} aria-hidden className="block">
            <ProductFrame src={p.image} alt="" aspect="4/5" inset="10%" />
          </a>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {pct > 0 ? (
            <span className="self-start rounded-tag bg-accent px-[7px] py-[3px] text-[13px] font-bold leading-none text-on-accent">{pct}% off</span>
          ) : null}
          <a href={href} className="line-clamp-2 text-[15px] font-semibold leading-tight text-ink no-underline hover:text-accent-ink">
            {p.title}
          </a>
          <Price minor={price} currency={cur} listMinor={list} showSavings={false} size={18} />
          {p.memberPct ? (
            <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
              <MemberDealTag label={memberDealLabel(store.membership.name)} />
              {formatMoney(toStoreMinor(memberPrice(p)!, cur, p.curBase), cur)} for members
            </span>
          ) : null}
          {lightning ? <LightningDealInfo deal={lightning} money={(minor) => formatMoney(toStoreMinor(minor, cur, p.curBase), cur)} early={early} /> : null}
          <span className="text-[13px] text-ink-2">
            <span aria-hidden className="text-star">★</span> {p.rating.toFixed(1)}
            <span className="text-ink-3"> · {p.reviewCount.toLocaleString('en-US')} ratings</span>
          </span>
          {p.brand ? <span className="truncate text-[13px] text-ink-3">{p.brand}</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line-2 pt-3">
        <CompareToggle item={{ id: p.id, name: p.title, image: p.image, category: p.category, categoryName: p.categoryName }} />
        <SaveButton productId={p.id} saved={saved} name={p.title} />
        {watch && lightning ? (
          <WatchDeal dealId={lightning.id} watching={watching} name={p.title} />
        ) : (
          <QuickAdd productId={p.id} name={p.title} optionsHref={p.sizes ? href : undefined} />
        )}
      </div>
    </article>
  );
}
