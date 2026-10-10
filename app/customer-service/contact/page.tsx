import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead } from '@/components/brand/Page';
import { fieldClass, selectClass } from '@/components/lib/controls';
import { Alert } from '@/components/primitives/Alert';
import { readUser } from '@/lib/auth';
import { messageFor } from '@/lib/data/errors';
import { isStoreSeller, listCaseOrders, listMyCases, MESSAGE_MAX, OPEN_CASE_LIMIT, SUBJECT_MAX, SUPPORT_TOPICS, supportTopic, TOPIC_LABELS } from '@/lib/data/support';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { shortDate } from '@/components/orders/format';
import { openCaseAction } from '../actions';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Contact us · Store' };

type SP = Promise<{ order?: string; topic?: string; seller?: string; error?: string }>;

const FIELD_ERROR: Record<string, string> = {
  invalid_topic: 'Choose what your question is about.',
  invalid_subject: `Add a subject of 3 to ${SUBJECT_MAX} characters, on one line.`,
  invalid_body: 'Tell us a little more: at least 10 characters, up to 2,000.',
  seller_order: 'That order has nothing from this seller in it. Choose another, or none.',
};

const label = 'text-[14px] font-semibold text-ink';

/**
 * /customer-service/contact ("Contact us"): open a support case with a first message, optionally
 * about one of the shopper's orders (`?order=` preselects it, from the order page's "Get help").
 * With `?seller=` it's "Contact seller": the case goes to that seller (one selling in this store),
 * and the orders to pick from are the ones with their items.
 */
export default async function ContactPage({ searchParams }: { searchParams: SP }) {
  const store = await getMarketplace();
  const sp = (p: string) => storePath(store, p);
  const q = await searchParams;
  const user = await readUser();
  if (!user) {
    const keep = new URLSearchParams();
    if (q.seller) keep.set('seller', q.seller);
    if (q.order) keep.set('order', q.order);
    const next = `/customer-service/contact${keep.size ? `?${keep}` : ''}`;
    redirect(sp(`/signin?next=${encodeURIComponent(next)}`));
  }
  const client = await db();
  const seller = q.seller && (await isStoreSeller(client, store.id, q.seller)) ? q.seller : null;
  const [orders, cases] = await Promise.all([listCaseOrders(client, store.id, user.id, 20, seller ?? undefined), listMyCases(client, store.id, user.id)]);
  const open = cases.filter((c) => c.status !== 'closed').length;
  const order = orders.find((o) => o.id === q.order)?.id ?? '';
  const topic = supportTopic(q.topic) ?? (order ? 'order' : '');
  const error = q.error ? FIELD_ERROR[q.error] ?? messageFor(q.error) ?? 'Something went wrong. Please try again.' : null;

  return (
    <AppShell>
      <Page>
        <a href={sp('/customer-service')} className="self-start text-[14px] text-ink underline underline-offset-2">← Help</a>
        {seller ? (
          <PageHead kicker="Contact seller" title={`Contact ${seller}`}>
            Ask the seller about an item, its delivery or a return. They reply on your case, and you can follow up there until it’s sorted.
          </PageHead>
        ) : (
          <PageHead kicker="Help" title="Contact us">
            Tell us what’s wrong. Someone from the store replies on your case, and you can follow up there until it’s sorted.
          </PageHead>
        )}

        {q.seller && !seller ? <Alert tone="warning">That seller isn’t selling in this store, so this goes to the store instead.</Alert> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}

        {open >= OPEN_CASE_LIMIT ? (
          <Alert tone="warning">
            You already have {OPEN_CASE_LIMIT} open cases in this store.{' '}
            <a href={sp('/customer-service/cases')} className="text-ink underline underline-offset-2">Reply on one of them</a>, or close one you no longer need.
          </Alert>
        ) : (
          <form action={openCaseAction} className="flex max-w-[680px] flex-col gap-4 rounded-panel border border-line bg-surface p-5 sm:p-6">
            {seller ? <input type="hidden" name="seller" value={seller} /> : null}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cs-topic" className={label}>What’s it about?</label>
              <select id="cs-topic" name="topic" required defaultValue={topic} className={`${selectClass} w-full`}>
                <option value="" disabled>Choose a topic</option>
                {SUPPORT_TOPICS.map((t) => (
                  <option key={t} value={t}>{TOPIC_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cs-order" className={label}>Order <span className="font-normal text-ink-3">(optional)</span></label>
              <select id="cs-order" name="order" defaultValue={order} className={`${selectClass} w-full`}>
                <option value="">Not about an order</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {shortDate(new Date(o.placedAt), store)} · {o.summary}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cs-subject" className={label}>Subject</label>
              <input id="cs-subject" name="subject" type="text" required minLength={3} maxLength={SUBJECT_MAX} className={fieldClass} placeholder="e.g. My package says delivered but I can’t find it" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cs-body" className={label}>Message</label>
              <textarea id="cs-body" name="body" required minLength={10} maxLength={MESSAGE_MAX} rows={6} className={`${fieldClass} h-auto py-2.5 leading-normal`} />
              <span className="text-[13px] text-ink-3">Don’t include card numbers or passwords.</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton variant="primary">Send</SubmitButton>
              {cases.length ? <a href={sp('/customer-service/cases')} className="text-[14px] text-ink underline underline-offset-2">Your support cases</a> : null}
            </div>
          </form>
        )}
      </Page>
    </AppShell>
  );
}
