import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { Page } from '@/components/brand/Page';
import { fieldClass } from '@/components/lib/controls';
import { shortDate, timeOfDay } from '@/components/orders/format';
import { Alert } from '@/components/primitives/Alert';
import { CaseStatus, CaseThread } from '@/components/support/CaseThread';
import { readUser } from '@/lib/auth';
import { messageFor } from '@/lib/data/errors';
import { getCase, markCaseSeen, MESSAGE_MAX, TOPIC_LABELS, type SupportCase } from '@/lib/data/support';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { closeCaseAction, replyCaseAction } from '../../actions';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Support case · Store' };

type Params = Promise<{ id: string }>;
type SP = Promise<{ done?: string; error?: string }>;

const DONE: Record<string, string> = {
  opened: 'Thanks, we’ve got your message. We’ll reply here, and you can add to it any time.',
  replied: 'Reply sent.',
  closed: 'Case closed.',
};

const ERROR: Record<string, string> = { invalid_reply: 'Write a reply of 2 to 2,000 characters.' };

/** "?seller=…&order=…": a new case like this closed one, with the same seller and order. */
function againQuery(c: Pick<SupportCase, 'seller' | 'orderId'>): string {
  const q = new URLSearchParams();
  if (c.seller) q.set('seller', c.seller);
  if (c.orderId) q.set('order', c.orderId);
  return q.size ? `?${q}` : '';
}

/** /customer-service/cases/:id: one of the shopper's support cases, its messages, and Reply / Close. Opening it marks its replies seen. */
export default async function SupportCasePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const [{ id }, { done, error }] = await Promise.all([params, searchParams]);
  const store = await getMarketplace();
  const sp = (p: string) => storePath(store, p);
  const user = await readUser();
  if (!user) redirect(sp(`/signin?next=${encodeURIComponent(`/customer-service/cases/${id}`)}`));
  const client = await db();
  const thread = await getCase(client, store.id, id, user.id);
  if (!thread) notFound();
  // reading the case: the store's replies so far are no longer new
  await markCaseSeen(client, thread.id);
  const when = (iso: string) => `${shortDate(new Date(iso), store)}, ${timeOfDay(new Date(iso), store)}`;
  const closed = thread.status === 'closed';

  return (
    <AppShell>
      <Page>
        <a href={sp('/customer-service/cases')} className="self-start text-[14px] text-ink underline underline-offset-2">← Your support cases</a>
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[clamp(24px,3vw,30px)] font-semibold leading-tight tracking-[-0.01em]">{thread.subject}</h1>
            <CaseStatus status={thread.status} viewer="customer" seller={thread.seller} />
          </div>
          <p className="m-0 text-[14px] text-ink-2">
            {thread.seller ? <>With seller <span className="font-semibold text-ink">{thread.seller}</span> · </> : null}
            {TOPIC_LABELS[thread.topic]} · Opened {shortDate(new Date(thread.createdAt), store)}
            {thread.orderId ? (
              <>
                {' · '}
                <a href={sp(`/orders/${encodeURIComponent(thread.orderId)}`)} className="text-ink underline underline-offset-2">
                  Order <span className="font-mono">{thread.orderId}</span>
                </a>
              </>
            ) : null}
          </p>
        </header>

        {done === 'opened' && thread.seller ? (
          <Alert tone="success">Message sent to {thread.seller}. They’ll reply here, and you can add to it any time.</Alert>
        ) : done && DONE[done] ? (
          <Alert tone="success">{DONE[done]}</Alert>
        ) : null}
        {error ? <Alert tone="error">{ERROR[error] ?? messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert> : null}

        <div className="flex max-w-[760px] flex-col gap-5">
          <CaseThread messages={thread.messages} viewer="customer" customer={thread.customer} seller={thread.seller} time={when} />

          {closed ? (
            <p className="m-0 text-[15px] text-ink-2">
              This case was closed{thread.closedAt ? ` on ${shortDate(new Date(thread.closedAt), store)}` : ''}.{' '}
              <a href={sp(`/customer-service/contact${againQuery(thread)}`)} className="text-ink underline underline-offset-2">
                {thread.seller ? 'Contact the seller again' : 'Contact us again'}
              </a>{' '}
              if you still need help.
            </p>
          ) : (
            <>
              <form action={replyCaseAction.bind(null, thread.id)} className="flex flex-col gap-2">
                <label htmlFor="cs-reply" className="text-[14px] font-semibold">Reply</label>
                <textarea id="cs-reply" name="body" required minLength={2} maxLength={MESSAGE_MAX} rows={4} className={`${fieldClass} h-auto py-2.5 leading-normal`} />
                <SubmitButton variant="primary" size="sm" className="self-start">Send reply</SubmitButton>
              </form>
              <div className="border-t border-line-2 pt-4">
                <ConfirmAction
                  action={closeCaseAction.bind(null, thread.id)}
                  label="Close case"
                  prompt={<>Close this case? You won’t be able to reply on it after.</>}
                  confirmLabel="Yes, close it"
                  pendingLabel="Closing…"
                />
              </div>
            </>
          )}
        </div>
      </Page>
    </AppShell>
  );
}
