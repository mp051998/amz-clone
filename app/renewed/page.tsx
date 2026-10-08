import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Card, DemoNote, Page, PageHead, Section, cardGrid } from '@/components/brand/Page';
import { EmptyState } from '@/components/decision/Badges';
import { buttonClasses } from '@/components/primitives/Button';
import { RenewedCard } from '@/components/renewed/RenewedCard';
import { listRenewed } from '@/lib/data/renewed';
import { storePath } from '@/lib/marketplace';
import { getMarketplace } from '@/lib/marketplace-server';
import { guaranteeDays, guaranteeLabel, guaranteeText } from '@/lib/renewed';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Renewed · Store' };

/**
 * /renewed, Amazon Renewed: other sellers' renewed offers in this store — inspected, tested and
 * cleaned to work like new, for less than new. In a store with the Renewed Guarantee (the US
 * store's 90 days) one that doesn't work as it should goes back for a refund or a replacement;
 * elsewhere it has its category's return window like anything else.
 */
export default async function RenewedPage() {
  const store = await getMarketplace();
  const items = await listRenewed(await db(), store.id);
  const days = guaranteeDays(store);
  const label = guaranteeLabel(store);

  return (
    <AppShell>
      <Page>
        <PageHead kicker="Renewed" title="Renewed">
          Pre-owned products that work and look like new, for less. Each is inspected, tested and cleaned by its seller, and ships with the accessories it needs.
        </PageHead>

        <Card className="flex flex-col gap-1.5">
          {days ? (
            <>
              <h2 className="m-0 text-[17px] font-semibold">{label}</h2>
              <p className="m-0 text-[14px] leading-relaxed text-ink-2">{guaranteeText(days)} That’s longer than most items’ return window.</p>
            </>
          ) : (
            <>
              <h2 className="m-0 text-[17px] font-semibold">Returns</h2>
              <p className="m-0 text-[14px] leading-relaxed text-ink-2">A renewed item can be returned within its category’s return window, like anything else; the product page says how long.</p>
            </>
          )}
        </Card>

        <Section title="Shop Renewed" note={items.length ? `${items.length} ${items.length === 1 ? 'offer' : 'offers'}` : undefined}>
          {items.length ? (
            <div className={cardGrid}>
              {items.map((it) => (
                <RenewedCard key={it.offer.id} item={it} store={store} guarantee={label} />
              ))}
            </div>
          ) : (
            <EmptyState title="No renewed offers right now" action={<a href={storePath(store, '/deals')} className={buttonClasses({ variant: 'secondary' })}>See today’s deals</a>}>
              Sellers list renewed items as they come in. Check back soon.
            </EmptyState>
          )}
        </Section>

        <DemoNote>{days ? 'This store’s own Renewed Guarantee, for demonstration.' : 'Renewed offers are other sellers’, for demonstration.'}</DemoNote>
      </Page>
    </AppShell>
  );
}
