import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { RankedPage } from '@/components/bestsellers/RankedPage';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { db } from '@/lib/supabase/server';
import { chartRows, giftIdeas } from '@/lib/data/catalog';
import { storeCategories } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';

export const metadata: Metadata = { title: 'Gift ideas · Store' };

export default async function GiftIdeasPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const categories = await storeCategories();
  const known = c && categories.some((cat) => cat.slug === c) ? c : undefined;
  // ranked in the database by how many shoppers gave each product lately: a department's top 40, or each department's top few
  const client = await db();
  const [items, rows, saved] = await Promise.all([
    known ? giftIdeas(client, store.id, { category: known, limit: 40 }) : [],
    known ? undefined : chartRows(client, store.id, 'gift-ideas', categories),
    viewerSavedIds(store.id),
  ]);

  return (
    <AppShell>
      <RankedPage
        store={store}
        basePath="/gift-ideas"
        kicker="Gift ideas · last 30 days"
        title="Gift ideas"
        lede="What shoppers sent as gifts most over the last 30 days, from gift orders and shared lists, then the most-rated products to fill the page. A popular gift is a safe start — check it suits who it’s for."
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
