import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { RankedPage } from '@/components/bestsellers/RankedPage';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { db } from '@/lib/supabase/server';
import { listProducts } from '@/lib/data/catalog';
import { storeCategories } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';

export const metadata: Metadata = { title: 'New & Trending · Store' };

export default async function NewReleasesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const categories = await storeCategories();
  const known = c && categories.some((cat) => cat.slug === c) ? c : undefined;
  // ordering happens in the database ('fresh' ordering), top 40
  const [items, saved] = await Promise.all([
    listProducts(await db(), store.id, { category: known, order: 'fresh', limit: 40 }),
    viewerSavedIds(store.id),
  ]);

  return (
    <AppShell>
      <RankedPage
        store={store}
        basePath="/new-releases"
        kicker="New & trending"
        title="New & trending"
        lede="The newest arrivals, freshest first. New models often have fewer reviews — check the rating count before you decide."
        categories={categories}
        active={known}
        items={items}
        saved={saved}
        ranked={false}
        tag="NEW"
      />
    </AppShell>
  );
}
