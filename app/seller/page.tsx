import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, cardGrid } from '@/components/brand/Page';
import { RankCard } from '@/components/bestsellers/RankCard';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { SellerRatings } from '@/components/seller/SellerRatings';
import { listProducts } from '@/lib/data/catalog';
import { sellerProfile } from '@/lib/data/seller-feedback';
import { getMarketplace } from '@/lib/marketplace-server';
import { db } from '@/lib/supabase/server';

type Search = Promise<{ name?: string | string[] }>;

const sellerName = (name: string | string[] | undefined) => (typeof name === 'string' ? name.trim().slice(0, 120) : '');

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const seller = sellerName((await searchParams).name);
  return { title: `${seller || 'Seller'} · Store` };
}

/** A seller's page, linked from "Sold by": how shoppers rated them, and what they sell here. */
export default async function SellerPage({ searchParams }: { searchParams: Search }) {
  const seller = sellerName((await searchParams).name);
  if (!seller) notFound();
  const store = await getMarketplace();
  const client = await db();
  const [profile, products, saved] = await Promise.all([
    sellerProfile(client, store.id, seller),
    listProducts(client, store.id, { seller, order: 'popular', limit: 40 }),
    viewerSavedIds(store.id),
  ]);
  if (!profile) notFound();

  return (
    <AppShell>
      <Page>
        <PageHead kicker="Seller" title={seller}>
          Ratings come from shoppers who bought from {seller} in this store, once their order arrived.
        </PageHead>
        <Section>
          <SellerRatings profile={profile} store={store} />
        </Section>
        <Section title={`Products from ${seller}`} note={products.length > 1 ? 'Most popular first' : undefined}>
          {products.length ? (
            <ul className={`${cardGrid} m-0 list-none p-0`}>
              {products.map((p) => (
                <li key={p.id} className="flex">
                  <div className="flex w-full flex-col [&>article]:flex-1">
                    <RankCard product={p} store={store} saved={saved.has(p.id)} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[14px] text-ink-2">Nothing from this seller is on sale here right now.</p>
          )}
        </Section>
      </Page>
    </AppShell>
  );
}
