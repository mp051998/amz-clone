import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/decision';
import { StatusChip } from '@/components/orders/Tracking';
import { buttonClasses } from '@/components/primitives/Button';
import { refundTo } from '@/components/orders/Returns';
import { readUser } from '@/lib/auth';
import { balanceMethod } from '@/lib/data/balance';
import { INBOX_DAYS, inboxSeenAt, isNewMessage, listInbox, markInboxSeen, type InboxKind, type InboxMessage } from '@/lib/data/inbox';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { planLongName } from '@/lib/plus-plans';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your messages · Store' };

const HEAD: Record<InboxKind, string> = {
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refund issued',
  items_cancelled: 'Items cancelled',
  items_refunded: 'Refund issued',
  price_guarantee: 'Pre-order Price Guarantee',
  return_received: 'Return received',
  return_refunded: 'Return refunded',
  return_rejected: 'Return not accepted',
  replacement_shipped: 'Replacement shipped',
  replacement_delivered: 'Replacement delivered',
  support_reply: 'Customer service replied',
  answer: 'New answer to your question',
  review_request: 'How was it?',
  recall: 'Product recall',
  deal_live: 'A deal you’re watching is live',
  claim_granted: 'A-to-z Guarantee claim granted',
  claim_denied: 'A-to-z Guarantee claim denied',
  plus_renewal: 'Your Plus membership renews soon',
  plus_ending: 'Your Plus membership is ending',
};

/** "It overheats" → "It overheats."; a sentence that already ends stays as it is. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** One line under the heading saying what it means for the shopper. */
function note(m: InboxMessage, money: (minor: number) => string, balance: string, date: (iso: string) => string): string {
  switch (m.kind) {
    case 'shipped':
      return 'Your order is on its way.';
    case 'out_for_delivery':
      return 'It’s with the courier for delivery.';
    case 'delivered':
      return 'Your order was delivered.';
    case 'cancelled':
      return 'Your order was cancelled.';
    case 'refunded':
      return `${money(m.amountMinor ?? 0)} back to how you paid.`;
    case 'items_cancelled':
      return 'Cancelled before they shipped. The rest of your order is still coming.';
    case 'items_refunded':
      return `${money(m.amountMinor ?? 0)} back to how you paid, for the items you cancelled.`;
    case 'price_guarantee':
      return m.unpaid
        ? `Its price dropped before release, so you pay the lower price: ${money(m.amountMinor ?? 0)} less when it arrives.`
        : `Its price dropped before release, so you pay the lower price: ${money(m.amountMinor ?? 0)} back to how you paid.`;
    case 'return_received':
      return 'We have your return.';
    case 'return_refunded':
      return m.toBalance ? `${money(m.amountMinor ?? 0)} added to ${balance}, as you asked.` : `${money(m.amountMinor ?? 0)} back to how you paid.`;
    case 'return_rejected':
      return m.detail ? `We couldn’t accept it: ${m.detail}` : 'We couldn’t accept it.';
    case 'replacement_shipped':
      return 'Your replacement is on its way, at no charge. Drop off the original with your return code.';
    case 'replacement_delivered':
      return 'Your replacement arrived.';
    case 'support_reply':
      return m.from ? `${m.from} replied to your message. Read it and answer on your case.` : 'Read our reply and answer it on your case.';
    case 'answer':
      return `${m.from ?? 'A shopper'} answered: “${m.detail ?? ''}”`;
    case 'review_request':
      return 'It arrived a couple of days ago. Rate it and tell other shoppers what you think.';
    case 'recall':
      return `Something you bought has been recalled. ${m.detail ? `${sentence(m.detail)} ` : ''}See what to do.`;
    case 'deal_live':
      return m.over
        ? `It went live at ${money(m.amountMinor ?? 0)} and has ended since.`
        : `It’s on at ${money(m.amountMinor ?? 0)}, for a few hours or until it’s all claimed.`;
    case 'claim_granted':
      return `We’ve stepped in for ${m.from ?? 'the seller'}: ${money(m.amountMinor ?? 0)} back to how you paid.${m.detail ? ` ${sentence(m.detail)}` : ''}`;
    case 'claim_denied':
      return `Your claim about ${m.from ?? 'the seller'}’s items wasn’t granted${m.detail ? `: ${sentence(m.detail)}` : '.'}`;
    case 'plus_renewal':
      return `It renews on the ${planLongName(m.plan ?? 'annual').toLowerCase()} on ${date(m.periodEnd ?? m.at)}. To switch plans or end it then, manage it before that day.`;
    case 'plus_ending':
      return `It ends on ${date(m.periodEnd ?? m.at)}, and FREE delivery with it. Keep your membership to carry on.`;
  }
}

/**
 * /account/messages: what's happened lately with the shopper's orders, returns, support cases and
 * questions in this store, newest first and grouped by day, as on Amazon's Message Center. What came
 * in since their last visit is marked new, and opening the page marks it all seen. Communication
 * preferences choose which kinds come.
 */
export default async function MessagesPage() {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/account/messages'));
  const client = await db();
  const [list, seenAt] = await Promise.all([listInbox(client, store.id, user.id, new Date(), store.dates.timeZone), inboxSeenAt(client, store.id)]);
  await markInboxSeen(client, store.id);
  const fresh = list.filter((m) => isNewMessage(m, seenAt)).length;
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const balance = refundTo(balanceMethod(store.id), '');
  const day = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', year: 'numeric', timeZone: store.dates.timeZone });
  const time = new Intl.DateTimeFormat(store.locale.default, { hour: 'numeric', minute: '2-digit', timeZone: store.dates.timeZone });

  const days: { label: string; items: InboxMessage[] }[] = [];
  for (const m of list) {
    const label = day.format(new Date(m.at));
    const last = days.at(-1);
    if (last?.label === label) last.items.push(m);
    else days.push({ label, items: [m] });
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <a href={sp('/account')} className="self-start text-[14px] text-ink underline underline-offset-2">← Account</a>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Your messages</h1>
          <span className="text-[15px] text-ink-2">
            Updates on your orders, returns, reviews, recalls, support cases, questions, the deals you’re watching and your Plus membership in this store from the last {INBOX_DAYS} days.
            {fresh ? ` ${fresh} new since you last looked.` : ''}
          </span>
          <a href={sp('/account/communications')} className="self-start text-[14px] text-ink underline underline-offset-2">
            Communication preferences
          </a>
        </div>

        {!list.length ? (
          <EmptyState title="No messages yet" action={<a href={sp('/orders')} className={buttonClasses({ variant: 'secondary' })}>Your orders</a>}>
            When an order ships or arrives, a refund goes through, or someone answers your question, it shows up here.
          </EmptyState>
        ) : null}

        {days.map((d) => (
          <section key={d.label} aria-label={d.label} className="flex flex-col gap-2">
            <h2 className="m-0 text-[15px] font-semibold text-ink-2">{d.label}</h2>
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
              {d.items.map((m) => (
                <li key={m.key} className="flex flex-col gap-0.5 border-t border-line-2 px-4 py-3.5 first:border-t-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`text-[15px] font-semibold ${m.kind === 'return_rejected' || m.kind === 'recall' || m.kind === 'claim_denied' ? 'text-bad' : ''}`}>
                        {m.kind === 'support_reply' && m.from ? 'Seller replied' : HEAD[m.kind]}
                        {isNewMessage(m, seenAt) ? <span className="sr-only"> (new)</span> : null}
                      </span>
                      {isNewMessage(m, seenAt) ? <span aria-hidden><StatusChip label="New" tone="dark" /></span> : null}
                    </span>
                    <time dateTime={m.at} className="text-[13px] text-ink-3 tabular-nums">{time.format(new Date(m.at))}</time>
                  </div>
                  <a href={sp(m.href)} className="line-clamp-2 text-[15px] text-ink underline underline-offset-2">
                    {m.subject}
                  </a>
                  <span className="line-clamp-3 text-[14px] text-ink-2">
                    {note(m, money, balance, (iso) => day.format(new Date(iso)))}
                    {m.orderId ? <span className="text-ink-3"> · Order <span className="font-mono text-[13px]">{m.orderId}</span></span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
