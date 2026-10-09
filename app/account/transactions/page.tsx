import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PaymentsTabs } from '@/components/account/PaymentsTabs';
import { EmptyState } from '@/components/decision';
import { buttonClasses } from '@/components/primitives/Button';
import { paymentText } from '@/components/orders/format';
import { readUser } from '@/lib/auth';
import { listTransactions, type Transaction } from '@/lib/data/transactions';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { formatMobile } from '@/lib/recharge';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your transactions · Store' };

const TITLE: Record<Transaction['source'], string> = {
  order: 'Order',
  cancellation: 'Refund: cancelled order',
  price_guarantee: 'Refund: Pre-order Price Guarantee',
  return: 'Refund: return',
  gift_card: 'Gift card purchase',
  reload: 'Balance reload',
  recharge: 'Mobile recharge',
  bill: 'Bill payment',
};

const STATUS: Partial<Record<Transaction['status'], string>> = {
  due: 'Due on delivery',
  pending: 'Refund in progress',
  failed: 'Refund delayed. We’re retrying it.',
};

/**
 * /account/transactions: every charge and refund in this store, newest first and grouped by day,
 * as on Amazon's "Your Payments → Transactions" (the Transactions tab beside Wallet). `?order=` narrows it to one order's charge and
 * refunds, where an order's "View related transactions" leads.
 */
export default async function TransactionsPage({ searchParams }: { searchParams?: Promise<{ order?: string }> } = {}) {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const order = (await searchParams)?.order?.trim() || undefined;
  const user = await readUser();
  if (!user) redirect(sp(order ? `/signin?next=${encodeURIComponent(`/account/transactions?order=${order}`)}` : '/signin?next=/account/transactions'));
  const all = await listTransactions(await db(), store.id, user.id);
  const list = order ? all.filter((t) => t.orderId === order) : all;
  const day = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', year: 'numeric', timeZone: store.dates.timeZone });

  const days: { label: string; items: Transaction[] }[] = [];
  for (const t of list) {
    const label = day.format(new Date(t.at));
    const last = days.at(-1);
    if (last?.label === label) last.items.push(t);
    else days.push({ label, items: [t] });
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <a href={sp('/account')} className="self-start text-[14px] text-ink underline underline-offset-2">← Account</a>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Your transactions</h1>
          {order ? (
            <span className="text-[15px] text-ink-2">
              Charges and refunds for order <span className="font-mono text-ink">{order}</span> ·{' '}
              <a href={sp('/account/transactions')} className="text-ink underline underline-offset-2">
                View all transactions
              </a>
            </span>
          ) : (
            <span className="text-[15px] text-ink-2">Charges and refunds in this store: orders, cancellations, returns, gift cards, balance reloads, recharges and bill payments.</span>
          )}
        </div>
        <PaymentsTabs current="transactions" href={sp} />

        {order && !list.length ? (
          <EmptyState title="No transactions for this order" action={<a href={sp('/account/transactions')} className={buttonClasses({ variant: 'secondary' })}>View all transactions</a>}>
            A charge shows up here once the order is paid for, and so do any refunds.
          </EmptyState>
        ) : null}

        {!order && !list.length ? (
          <EmptyState title="No transactions yet" action={<a href={sp('/')} className={buttonClasses({ variant: 'secondary' })}>Start shopping</a>}>
            When you place an order or buy a gift card, the charge shows up here, and so do any refunds.
          </EmptyState>
        ) : null}

        {days.map((d) => (
          <section key={d.label} aria-label={d.label} className="flex flex-col gap-2">
            <h2 className="m-0 text-[15px] font-semibold text-ink-2">{d.label}</h2>
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
              {d.items.map((t) => {
                const note = STATUS[t.status];
                const amount = formatMoney(t.amountMinor, store.currency.code);
                return (
                  <li key={t.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-t border-line-2 px-4 py-3.5 first:border-t-0">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold">
                        {TITLE[t.source]}
                        {t.orderId ? (
                          <>
                            {' '}
                            <a href={sp(`/orders/${encodeURIComponent(t.orderId)}?placed=0`)} className="font-mono text-[13px] font-normal text-ink underline underline-offset-2" aria-label={`Order ${t.orderId}`}>
                              {t.orderId}
                            </a>
                          </>
                        ) : null}
                        {t.number ? <span className="font-normal tabular-nums"> {formatMobile(t.number)}</span> : null}
                        {t.biller ? <span className="font-normal"> {t.biller.name} · <span className="tabular-nums">{t.biller.account}</span></span> : null}
                      </span>
                      <span className="text-[13px] text-ink-2">
                        {t.kind === 'refund' ? 'To ' : ''}
                        {paymentText(t.method, t.paymentLabel)}
                        {note ? <> · <span className={t.status === 'failed' ? 'text-bad' : 'text-ink-3'}>{note}</span></> : null}
                      </span>
                    </div>
                    <strong
                      className={`text-[16px] tabular-nums ${t.kind === 'refund' ? 'text-good' : t.status === 'due' ? 'font-normal text-ink-3' : ''}`}
                      aria-label={`${t.kind === 'refund' ? 'Refund' : 'Charge'} ${amount}`}
                    >
                      {t.kind === 'refund' ? '+' : '−'}
                      {amount}
                    </strong>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
