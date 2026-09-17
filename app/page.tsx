import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { CampaignHero } from '@/components/home/CampaignHero';
import { MerchandisingCard } from '@/components/home/MerchandisingCard';
import { DealRail } from '@/components/home/DealRail';
import { PayStrip } from '@/components/home/PayStrip';
import { getHomeContent } from '@/lib/home-content';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  const site = `Amazon.${store.hostname.split('.').pop()}`;
  return { title: `${site}. Spend less. Smile more.` };
}

export default async function Home() {
  const store = await getMarketplace();
  const { campaign, cards, rails, showPay } = getHomeContent(store);

  return (
    <AppShell>
      <div className="bg-surface-band pb-10">
        <CampaignHero campaign={campaign} />
        <div className="mx-auto mt-5 max-w-[1500px] space-y-5 px-4">
          {store.ui.home.map((module) => {
            if (module.kind === 'merchandising-grid') {
              return (
                <div key={module.id} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {module.cardIds.map((id) => {
                    const card = cards.find((candidate) => candidate.id === id);
                    return card ? <MerchandisingCard key={id} card={card} /> : null;
                  })}
                </div>
              );
            }
            if (module.kind === 'deal-rail') {
              const rail = rails.find((candidate) => candidate.id === module.id);
              return rail ? <DealRail key={rail.id} title={rail.title} products={rail.products} store={store} /> : null;
            }
            return null;
          })}
          {showPay ? <PayStrip href={storePath(store, '/amazon-pay')} /> : null}
        </div>
      </div>
    </AppShell>
  );
}
