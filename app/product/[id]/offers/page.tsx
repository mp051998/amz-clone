import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Page } from '@/components/brand/Page';
import { Pill } from '@/components/decision/Pill';
import { dayLabel } from '@/components/orders/format';
import { OfferList } from '@/components/product/Offers';
import { offerItem } from '@/components/product/offerItems';
import { ProductFrame } from '@/components/decision/ProductFrame';
import { Stars } from '@/components/primitives/Stars';
import { readUser } from '@/lib/auth';
import { getProduct } from '@/lib/data/catalog';
import { listOffers } from '@/lib/data/offers';
import { plusMembership } from '@/lib/data/plus';
import { sellerRatings, type SellerRating } from '@/lib/data/seller-feedback';
import { deliveryOptions } from '@/lib/decision/tracking';
import { toStoreMinor } from '@/lib/fx';
import { storePath } from '@/lib/marketplace';
import { getMarketplace } from '@/lib/marketplace-server';
import { formatMoney } from '@/lib/marketplaces';
import { isOfferKind, kindName, offerKind, offerSummary } from '@/lib/offers';
import { releaseOf } from '@/lib/pre-order';
import { db } from '@/lib/supabase/server';
import type { Product } from '@/lib/types';

type Params = Promise<{ id: string }>;
type Search = Promise<{ condition?: string | string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const p = await getProduct(await db(), id, { includeArchived: true });
  return { title: p ? `Buying options: ${p.title} · Store` : 'Page not found · Store', robots: { index: false } };
}

/**
 * Every way to buy a product, as Amazon's "See All Buying Options": its own offer first, then the
 * other sellers' new, renewed and used offers, cheapest first, filtered by condition.
 */
export default async function OffersPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const client = await db();
  const p = await getProduct(client, id, { includeArchived: true });
  if (!p) notFound();
  const here = (productId: string) => storePath({ id: p.market }, `/product/${encodeURIComponent(productId)}`);
  if (p.offerOf) redirect(`${here(p.offerOf)}/offers`);
  const store = await getMarketplace();
  if (p.market !== store.id) redirect(`${here(p.id)}/offers`);

  const user = await readUser();
  const [offers, plus] = await Promise.all([
    p.archived ? Promise.resolve([]) : listOffers(client, p.id).catch((): Product[] => []),
    user ? plusMembership(client).catch(() => null) : Promise.resolve(null),
  ]);
  const all = p.archived || p.stock <= 0 ? offers : [p, ...offers];
  const ratings = await sellerRatings(client, store.id, [...new Set(all.map((x) => x.seller))]).catch(() => new Map<string, SellerRating>());

  const condition = typeof sp.condition === 'string' && isOfferKind(sp.condition) ? sp.condition : null;
  const shown = condition ? all.filter((x) => offerKind(x) === condition) : all;
  const summary = offerSummary(all);

  const cur = store.currency.code;
  const now = new Date();
  const threshold = store.delivery.freeThresholdMinor;
  const deliveryText = (x: Product, priceMinor: number) => {
    const standard = new Date(deliveryOptions(now, store.dates.timeZone, null, releaseOf(x, now)).standard);
    return `${plus || priceMinor >= threshold ? 'FREE delivery' : 'Delivery'} ${dayLabel(standard, store, now)}`;
  };
  const items = shown.map((x) => {
    const priceMinor = toStoreMinor(x.priceMinor, cur, x.curBase);
    return offerItem(x, {
      store,
      priceText: formatMoney(priceMinor, cur),
      rating: ratings.get(x.seller),
      delivery: deliveryText(x, priceMinor),
      featured: x.id === p.id,
    });
  });
  const filterHref = (k: string | null) => `${here(p.id)}/offers${k ? `?condition=${k}` : ''}`;

  return (
    <AppShell>
      <Page narrow>
        <a href={here(p.id)} className="flex items-center gap-3.5 text-ink no-underline">
          <span className="w-16 flex-none"><ProductFrame src={p.image} alt="" aspect="1/1" /></span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="line-clamp-2 text-[15px] font-semibold underline-offset-2 hover:underline">{p.title}</span>
            {p.reviewCount ? <Stars rating={p.rating} count={p.reviewCount} size={14} /> : null}
          </span>
        </a>

        <div className="flex flex-col gap-3">
          <h1 className="m-0 text-[clamp(24px,3vw,30px)] font-semibold">Buying options</h1>
          {summary && summary.kinds.length > 1 ? (
            <nav aria-label="Condition" className="flex flex-wrap gap-2">
              <Pill size="sm" href={filterHref(null)} selected={!condition}>All ({summary.count})</Pill>
              {summary.kinds.map((k) => (
                <Pill key={k.kind} size="sm" href={filterHref(k.kind)} selected={condition === k.kind}>
                  {kindName(k.kind)} ({k.count})
                </Pill>
              ))}
            </nav>
          ) : null}
        </div>

        {items.length ? (
          <OfferList name={p.title} offers={items} />
        ) : (
          <p className="m-0 text-[15px] text-ink-2">
            {all.length ? (
              <>
                No {condition ? kindName(condition).toLowerCase() : ''} offers right now.{' '}
                <a href={filterHref(null)} className="text-ink underline underline-offset-2">See all buying options</a>
              </>
            ) : (
              <>
                This item isn’t available from any seller right now.{' '}
                <a href={here(p.id)} className="text-ink underline underline-offset-2">Back to the product</a>
              </>
            )}
          </p>
        )}
      </Page>
    </AppShell>
  );
}
