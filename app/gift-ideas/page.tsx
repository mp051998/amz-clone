import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { RankedPage } from '@/components/bestsellers/RankedPage';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { db } from '@/lib/supabase/server';
import { giftIdeas } from '@/lib/data/catalog';
import { storeCategories } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';

export const metadata: Metadata = { title: 'Gift ideas · Store' };

export default async function GiftIdeasPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const categories = await storeCategories();
  const known = c && categories.some((cat) => cat.slug === c) ? c : undefined;
  // ranked in the database by how many shoppers gave each product lately, top 40
  const [items, saved] = await Promise.all([giftIdeas(await db(), store.id, { category: known, limit: 40 }), viewerSavedIds(store.id)]);

  return (
    <AppShell>
      <RankedPage
        store={store}
        basePath="/gift-ideas"
        kicker="Gift ideas · updated daily"
        title="Gift ideas"
        lede="What shoppers sent as gifts most over the last 30 days, from gift orders and shared lists. A popular gift is a safe start — check it suits who it’s for."
        categories={categories}
        active={known}
        items={items}
        saved={saved}
        ranked
      />
    </AppShell>
  );
}
