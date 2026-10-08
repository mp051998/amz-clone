import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, cardGrid } from '@/components/brand/Page';
import { RankCard } from '@/components/bestsellers/RankCard';
import { Pill } from '@/components/decision/Pill';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { buttonClasses } from '@/components/primitives/Button';
import { brandStore } from '@/lib/data/brands';
import { storePath } from '@/lib/marketplace';
import { getMarketplace } from '@/lib/marketplace-server';
import { db } from '@/lib/supabase/server';
import type { Product } from '@/lib/types';

type Params = Promise<{ brand: string }>;

/** The brand in the path ("/stores/Bose", "/stores/Acme%20Audio"). */
function brandName(raw: string): string {
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    // a stray % in an already-decoded name
  }
  return name.trim().slice(0, 120);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const brand = brandName((await params).brand);
  return { title: `${brand || 'Brand'} Store · Store` };
}

/**
 * A brand's store, linked from "Visit the Bose Store" on its product pages: its best sellers, its
 * deals, then everything it sells here by department, as Amazon's brand stores lay it out.
 */
export default async function BrandStorePage({ params }: { params: Params }) {
  const brand = brandName((await params).brand);
  if (!brand) notFound();
  const store = await getMarketplace();
  const [shop, saved] = await Promise.all([brandStore(await db(), store.id, brand), viewerSavedIds(store.id)]);
  if (!shop) notFound();

  // search narrowed to the brand (and a department), with its filters and sorts
  const search = (dept?: string) =>
    storePath(store, `/s?brand=${encodeURIComponent(shop.brand)}${dept ? `&dept=${encodeURIComponent(dept)}` : ''}`);
  const grid = (products: Product[]) => (
    <ul className={`${cardGrid} m-0 list-none p-0`}>
      {products.map((p) => (
        <li key={p.id} className="flex">
          <div className="flex w-full flex-col [&>article]:flex-1">
            <RankCard product={p} store={store} saved={saved.has(p.id)} />
          </div>
        </li>
      ))}
    </ul>
  );
  // only worth a jump list with more than one department to jump between
  const nav = [
    { id: 'best-sellers', label: 'Best Sellers' },
    ...(shop.deals.length ? [{ id: 'deals', label: 'Deals' }] : []),
    ...shop.departments.map((d) => ({ id: `dept-${d.slug}`, label: d.name })),
  ];

  return (
    <AppShell>
      <Page>
        <PageHead
          kicker="Brand store"
          title={shop.brand}
          actions={
            <a href={search()} className={buttonClasses({ variant: 'secondary' })}>
              Search all {shop.brand}
            </a>
          }
        >
          {shop.count === 1 ? 'One product' : `${shop.count} products`} from {shop.brand} in this store
          {shop.departments.length > 1 ? `, across ${shop.departments.length} departments` : ''}.
        </PageHead>
        {shop.departments.length > 1 ? (
          <nav aria-label={`${shop.brand} store`} className="flex flex-wrap gap-2">
            {nav.map((n) => (
              <Pill key={n.id} href={`#${n.id}`} size="sm">{n.label}</Pill>
            ))}
          </nav>
        ) : null}
        <Section
          id="best-sellers"
          title="Best Sellers"
          note={
            shop.count > shop.bestSellers.length ? (
              <a href={search()} className="text-ink underline underline-offset-2">See all {shop.count}</a>
            ) : undefined
          }
        >
          {grid(shop.bestSellers)}
        </Section>
        {shop.deals.length ? (
          <Section id="deals" title="Deals" note="Biggest discount first">
            {grid(shop.deals)}
          </Section>
        ) : null}
        {/* one department is the whole store, already shown as its best sellers */}
        {shop.departments.length > 1
          ? shop.departments.map((d) => (
              <Section
                key={d.slug}
                id={`dept-${d.slug}`}
                title={d.name}
                note={
                  d.count > d.products.length ? (
                    <a href={search(d.slug)} className="text-ink underline underline-offset-2">See all {d.count}</a>
                  ) : undefined
                }
              >
                {grid(d.products)}
              </Section>
            ))
          : null}
      </Page>
    </AppShell>
  );
}
