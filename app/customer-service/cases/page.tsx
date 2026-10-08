import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead } from '@/components/brand/Page';
import { EmptyState } from '@/components/decision/Badges';
import { shortDate } from '@/components/orders/format';
import { buttonClasses } from '@/components/primitives/Button';
import { CaseStatus } from '@/components/support/CaseThread';
import { StatusChip } from '@/components/orders/Tracking';
import { readUser } from '@/lib/auth';
import { listMyCases, TOPIC_LABELS, unreadCaseIds } from '@/lib/data/support';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your support cases · Store' };

/**
 * /customer-service/cases: the shopper's support cases in this store, open ones first, latest
 * activity first; a case the store has replied on since the shopper last opened it says so.
 */
export default async function SupportCasesPage() {
  const store = await getMarketplace();
  const sp = (p: string) => storePath(store, p);
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/customer-service/cases'));
  const client = await db();
  const [cases, unread] = await Promise.all([listMyCases(client, store.id, user.id), unreadCaseIds(client, store.id)]);
  const fresh = cases.filter((c) => unread.has(c.id)).length;

  return (
    <AppShell>
      <Page>
        <a href={sp('/customer-service')} className="self-start text-[14px] text-ink underline underline-offset-2">← Help</a>
        <PageHead
          kicker="Help"
          title="Your support cases"
          actions={<a href={sp('/customer-service/contact')} className={buttonClasses({ variant: 'primary' })}>Contact us</a>}
        >
          What you’ve asked us, and our replies. Open a case to reply or close it.
          {fresh ? <> <strong className="font-semibold text-ink">{fresh === 1 ? 'We’ve replied on 1 case since you last looked.' : `We’ve replied on ${fresh} cases since you last looked.`}</strong></> : null}
        </PageHead>

        {cases.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {cases.map((c) => (
              <li key={c.id}>
                <a
                  href={sp(`/customer-service/cases/${c.id}`)}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-panel border border-line bg-surface p-[18px] text-ink no-underline transition-colors hover:border-ink"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-[17px] font-semibold leading-tight">
                      {c.subject}
                      {unread.has(c.id) ? <span className="sr-only"> (new reply)</span> : null}
                    </span>
                    <span className="text-[13px] text-ink-3">
                      {c.seller ? `With ${c.seller} · ` : ''}
                      {TOPIC_LABELS[c.topic]}
                      {c.orderId ? <> · Order <span className="font-mono">{c.orderId}</span></> : null} · Updated {shortDate(new Date(c.updatedAt), store)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {unread.has(c.id) ? <span aria-hidden><StatusChip label="New reply" tone="dark" /></span> : null}
                    <CaseStatus status={c.status} viewer="customer" seller={c.seller} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No support cases yet."
            action={<a href={sp('/customer-service/contact')} className="text-[15px] underline underline-offset-2">Contact us</a>}
          >
            When you contact us, the case and our replies show up here.
          </EmptyState>
        )}
      </Page>
    </AppShell>
  );
}
