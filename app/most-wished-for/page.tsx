import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { RankedPage } from '@/components/bestsellers/RankedPage';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { db } from '@/lib/supabase/server';
import { chartRows, mostWishedFor } from '@/lib/data/catalog';
import { storeCategories } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';

export const metadata: Metadata = { title: 'Most wished for · Store' };

export default async function MostWishedForPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const categories = await storeCategories();
  const known = c && categories.some((cat) => cat.slug === c) ? c : undefined;
  // ranked in the database by how many shoppers saved each product to a list lately: a department's top 40, or each department's top few
  const client = await db();
  const [items, rows, saved] = await Promise.all([
    known ? mostWishedFor(client, store.id, { category: known, limit: 40 }) : [],
    known ? undefined : chartRows(client, store.id, 'most-wished-for', categories),
    viewerSavedIds(store.id),
  ]);

  return (
    <AppShell>
      <RankedPage
        store={store}
        basePath="/most-wished-for"
        kicker="Most wished for · last 30 days"
        title="Most wished for"
        lede="What shoppers added to their lists most over the last 30 days, then the most-rated products to fill the page. Wanted by many is a good start — check it does what you need before it goes on yours."
        categories={categories}
        active={known}
        items={items}
        saved={saved}
        ranked
        rows={rows}
      />
    </AppShell>
  );
}
