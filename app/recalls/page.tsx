import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section } from '@/components/brand/Page';
import { ProductFrame } from '@/components/decision';
import { buttonClasses } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { listRecalls, myRecalls, type MyRecall, type Recall } from '@/lib/data/recalls';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Recalls and Product Safety Alerts · Store' };

/**
 * /recalls: the store's product recalls, newest first, as on Amazon's "Recalls and Product Safety
 * Alerts". Signed in, the shopper's own recalled purchases come first, each with the order it was
 * on; the store tells them in their messages too.
 */
export default async function RecallsPage() {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  const client = await db();
  const [all, mine] = await Promise.all([
    listRecalls(client, store.id).catch((): Recall[] => []),
    user ? myRecalls(client, store.id, user.id).catch((): MyRecall[] => []) : Promise.resolve(null),
  ]);
  const yours = new Set(mine?.map((r) => r.productId));
  const day = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', year: 'numeric', timeZone: store.dates.timeZone });

  // each recall's anchor (#recall-<id>, linked from messages and orders) is on the shopper's own copy when they have one
  const card = (r: Recall, orderId?: string) => (
    <li key={r.productId} id={orderId || !yours.has(r.productId) ? `recall-${r.productId}` : undefined} className="flex scroll-mt-24 flex-wrap gap-4 rounded-card border border-line bg-surface p-[18px]">
      <a href={sp(`/product/${encodeURIComponent(r.productId)}`)} className="w-20 flex-none" tabIndex={-1} aria-hidden>
        <ProductFrame src={r.image} alt="" aspect="1/1" />
      </a>
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
        <a href={sp(`/product/${encodeURIComponent(r.productId)}`)} className="line-clamp-2 text-[16px] font-semibold text-ink no-underline">{r.title}</a>
        <span className="text-[13px] text-ink-3">
          Recalled {day.format(new Date(r.issuedAt))}
          {orderId ? (
            <>
              {' · '}You bought it on{' '}
              <a href={sp(`/orders/${encodeURIComponent(orderId)}?placed=0`)} className="text-ink-3 underline underline-offset-2">
                order <span className="font-mono text-[12px]">{orderId}</span>
              </a>
            </>
          ) : null}
        </span>
        <p className="m-0 text-[14px] text-ink"><strong className="font-semibold text-bad">Hazard:</strong> {r.hazard}</p>
        <p className="m-0 text-[14px] text-ink"><strong className="font-semibold">What to do:</strong> {r.remedy}</p>
      </div>
    </li>
  );

  return (
    <AppShell>
      <Page>
        <PageHead kicker="Product safety" title="Recalls and Product Safety Alerts">
          When a product sold here turns out to be unsafe, we take it off sale and list it here with what to do. If you bought it, we tell you in your messages and on the order.
        </PageHead>

        {mine ? (
          <Section title="Your recalled items" id="yours">
            {mine.length ? (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">{mine.map((r) => card(r, r.orderId))}</ul>
            ) : (
              <p className="m-0 text-[15px] text-ink-2">Nothing you’ve bought in this store has been recalled.</p>
            )}
          </Section>
        ) : (
          <section className="flex flex-col items-start gap-3 rounded-panel border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-[15px] text-ink-2">Sign in to see whether anything you’ve bought has been recalled.</p>
            <a href={sp('/signin?next=/recalls')} className={buttonClasses({ variant: 'dark', size: 'sm' })}>Sign in</a>
          </section>
        )}

        <Section title="Recent recalls in this store" id="all">
          {all.length ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">{all.map((r) => card(r))}</ul>
          ) : (
            <p className="m-0 text-[15px] text-ink-2">No products sold here have been recalled.</p>
          )}
        </Section>
      </Page>
    </AppShell>
  );
}
