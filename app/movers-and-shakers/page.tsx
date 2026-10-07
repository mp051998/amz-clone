import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { RankedPage } from '@/components/bestsellers/RankedPage';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { db } from '@/lib/supabase/server';
import { moversAndShakers } from '@/lib/data/catalog';
import { storeCategories } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';

export const metadata: Metadata = { title: 'Movers & shakers · Store' };

export default async function MoversAndShakersPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const categories = await storeCategories();
  const known = c && categories.some((cat) => cat.slug === c) ? c : undefined;
  // ranked in the database by the climb in sales rank, this week against last, top 40
  const [movers, saved] = await Promise.all([moversAndShakers(await db(), store.id, { category: known, limit: 40 }), viewerSavedIds(store.id)]);

  return (
    <AppShell>
      <RankedPage
        store={store}
        basePath="/movers-and-shakers"
        kicker="Movers & shakers · this week against last"
        title="Movers & shakers"
        lede="The biggest gainers in sales rank: where each product sells this week against where it sold last week, the steepest climb first. Something new to the ranks is worth a closer look, not a sure thing."
        categories={categories}
        active={known}
        items={movers.map((m) => m.product)}
        saved={saved}
        ranked
        moves={new Map(movers.map((m) => [m.product.id, { rank: m.rank, wasRank: m.wasRank }]))}
      />
    </AppShell>
  );
}
