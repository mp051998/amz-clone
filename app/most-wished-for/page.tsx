import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { RankedPage } from '@/components/bestsellers/RankedPage';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { db } from '@/lib/supabase/server';
import { mostWishedFor } from '@/lib/data/catalog';
import { storeCategories } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';

export const metadata: Metadata = { title: 'Most wished for · Store' };

export default async function MostWishedForPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const categories = await storeCategories();
  const known = c && categories.some((cat) => cat.slug === c) ? c : undefined;
  // ranked in the database by how many shoppers saved each product to a list lately, top 40
  const [items, saved] = await Promise.all([mostWishedFor(await db(), store.id, { category: known, limit: 40 }), viewerSavedIds(store.id)]);

  return (
    <AppShell>
      <RankedPage
        store={store}
        basePath="/most-wished-for"
        kicker="Most wished for · updated daily"
        title="Most wished for"
        lede="What shoppers are adding to their lists most over the last 30 days. Wanted by many is a good start — check it does what you need before it goes on yours."
        categories={categories}
        active={known}
        items={items}
        saved={saved}
        ranked
      />
    </AppShell>
  );
}
