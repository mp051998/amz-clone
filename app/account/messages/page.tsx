import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/decision';
import { buttonClasses } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { INBOX_DAYS, listInbox, type InboxKind, type InboxMessage } from '@/lib/data/inbox';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your messages · Store' };

const HEAD: Record<InboxKind, string> = {
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refund issued',
  return_received: 'Return received',
  return_refunded: 'Return refunded',
  return_rejected: 'Return not accepted',
  support_reply: 'Customer service replied',
  answer: 'New answer to your question',
};

/** One line under the heading saying what it means for the shopper. */
function note(m: InboxMessage, money: (minor: number) => string): string {
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
    case 'return_received':
      return 'We have your return.';
    case 'return_refunded':
      return `${money(m.amountMinor ?? 0)} back to how you paid.`;
    case 'return_rejected':
      return m.detail ? `We couldn’t accept it: ${m.detail}` : 'We couldn’t accept it.';
    case 'support_reply':
      return 'Read our reply and answer it on your case.';
    case 'answer':
      return `${m.from ?? 'A shopper'} answered: “${m.detail ?? ''}”`;
  }
}

/**
 * /account/messages: what's happened lately with the shopper's orders, returns, support cases and
 * questions in this store, newest first and grouped by day, as on Amazon's Message Center.
 */
export default async function MessagesPage() {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/account/messages'));
  const list = await listInbox(await db(), store.id, user.id, new Date(), store.dates.timeZone);
  const money = (minor: number) => formatMoney(minor, store.currency.code);
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
            Updates on your orders, returns, support cases and questions in this store from the last {INBOX_DAYS} days.
          </span>
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
                    <span className={`text-[15px] font-semibold ${m.kind === 'return_rejected' ? 'text-bad' : ''}`}>{HEAD[m.kind]}</span>
                    <time dateTime={m.at} className="text-[13px] text-ink-3 tabular-nums">{time.format(new Date(m.at))}</time>
                  </div>
                  <a href={sp(m.href)} className="line-clamp-2 text-[15px] text-ink underline underline-offset-2">
                    {m.subject}
                  </a>
                  <span className="line-clamp-3 text-[14px] text-ink-2">
                    {note(m, money)}
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
