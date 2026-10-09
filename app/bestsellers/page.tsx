import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { RankedPage } from '@/components/bestsellers/RankedPage';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { db } from '@/lib/supabase/server';
import { chartRows, listProducts } from '@/lib/data/catalog';
import { storeCategories } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';

export const metadata: Metadata = { title: 'Bestsellers · Store' };

export default async function BestSellersPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const categories = await storeCategories();
  const known = c && categories.some((cat) => cat.slug === c) ? c : undefined;
  // ranking happens in the database ('popular' ordering): a department's top 40, or each department's top few
  const client = await db();
  const [items, rows, saved] = await Promise.all([
    known ? listProducts(client, store.id, { category: known, order: 'popular', limit: 40 }) : [],
    known ? undefined : chartRows(client, store.id, 'bestsellers', categories),
    viewerSavedIds(store.id),
  ]);

  return (
    <AppShell>
      <RankedPage
        store={store}
        basePath="/bestsellers"
        kicker="Bestsellers · by number of ratings"
        title="Bestsellers"
        lede="The products shoppers have rated most, the most ratings first. Popular isn't always right for you — compare a few against what matters to you."
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
