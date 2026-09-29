import type { ReactNode } from 'react';
import { ConfirmAction } from '../admin/ConfirmAction';
import { formatMoney } from '@/lib/marketplaces';
import type { CurrencyCode } from '@/lib/contracts';
import type { ReturnSummary } from '@/lib/data/returns';
import type { OrderReturn, PaymentMethod, ReturnReason } from '@/lib/types';
import { StatusChip } from './Tracking';
import { longDate, shortDate, type ChipTone, type StoreDates } from './format';

/** Wording for returns, shared by the shopper and admin pages. */

export const REASON_LABEL: Record<ReturnReason, string> = {
  no_longer_needed: 'No longer needed',
  bought_by_mistake: 'Bought by mistake',
  better_price: 'Found a better price',
  damaged: 'Arrived damaged',
  defective: 'Defective or doesn’t work',
  wrong_item: 'Wrong item was sent',
  missing_parts: 'Missing parts or accessories',
  not_as_described: 'Not as described',
};

/** Where a refund goes, mid-sentence: the card, the balance paid with, or (pay on delivery) the bank. */
export function refundTo(method: PaymentMethod, label: string): string {
  if (method === 'giftcard') return 'your gift card balance';
  if (method === 'amazonpay') return 'your wallet balance';
  if (method === 'cod') return 'your bank account';
  return label || (method === 'card' ? 'your card' : 'your payment method');
}

/** The orders-list chip for an order's most pressing return (see `returnSummaries`). */
export const RETURN_SUMMARY_CHIP: Record<ReturnSummary, { label: string; tone: ChipTone }> = {
  requested: { label: 'Return started', tone: 'warn' },
  refund_pending: { label: 'Return received', tone: 'warn' },
  refunded: { label: 'Return refunded', tone: 'good' },
};

/** One chip for where a return stands. */
export function returnChip(r: OrderReturn): { label: string; tone: ChipTone } {
  switch (r.status) {
    case 'requested':
      return { label: 'Return started', tone: 'warn' };
    case 'rejected':
      return { label: 'Not accepted', tone: 'dark' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
    default:
      if (r.refund?.status === 'succeeded') return { label: 'Refunded', tone: 'good' };
      if (r.refund?.status === 'failed') return { label: 'Refund failed', tone: 'dark' };
      return { label: 'Refund pending', tone: 'warn' };
  }
}

export function itemsText(r: OrderReturn): string {
  return r.items.map((i) => `${i.title}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ');
}

/** "Items $20.00 · tax $1.60 · delivery $5.99" (parts that are zero are left out). */
export function refundBreakdown(r: OrderReturn, currency: CurrencyCode): string {
  const m = (n: number) => formatMoney(n, currency);
  return [`Items ${m(r.itemsMinor)}`, r.taxMinor ? `tax ${m(r.taxMinor)}` : '', r.shipMinor ? `delivery ${m(r.shipMinor)}` : '']
    .filter(Boolean)
    .join(' · ');
}

/** What the shopper needs to know about one return, and what they can do next. */
export function ReturnCard({
  r,
  currency,
  method,
  label,
  store,
  cancel,
}: {
  r: OrderReturn;
  currency: CurrencyCode;
  method: PaymentMethod;
  label: string;
  store: StoreDates;
  /** bound "cancel return" action, while it can be cancelled */
  cancel?: () => Promise<void>;
}) {
  const money = formatMoney(r.refundMinor, currency);
  const to = refundTo(method, label);
  let lead: ReactNode;
  if (r.status === 'requested') {
    lead = (
      <>
        Drop it off by <strong>{longDate(new Date(r.dropoffBy), store)}</strong> at any drop-off point and show this code:{' '}
        <strong className="font-mono tracking-[0.06em]">{r.dropoffCode}</strong>. We’ll refund {money} to {to} once it reaches us.
      </>
    );
  } else if (r.status === 'rejected') {
    const note = r.rejectNote && !/[.!?]$/.test(r.rejectNote) ? `${r.rejectNote}.` : r.rejectNote;
    lead = <>We couldn’t accept this return{note ? <>: {note}</> : '.'} Contact customer service if you think that’s wrong.</>;
  } else if (r.status === 'cancelled') {
    lead = <>You cancelled this return{r.cancelledAt ? ` on ${shortDate(new Date(r.cancelledAt), store)}` : ''}. Nothing was refunded.</>;
  } else if (r.refund?.status === 'succeeded') {
    lead = (
      <>
        {money} refunded to {to}
        {r.refund.refundedAt ? ` on ${shortDate(new Date(r.refund.refundedAt), store)}` : ''}.
        {method === 'card' ? ' Card refunds take 5–10 business days to show up.' : ''}
      </>
    );
  } else if (r.refund?.status === 'failed') {
    lead = <>We received your return. The refund of {money} to {to} is delayed; we’re retrying it, so there’s nothing you need to do.</>;
  } else {
    lead = <>We received your return. The refund of {money} to {to} is on its way.</>;
  }

  return (
    <article aria-label="Return" className="flex flex-col gap-2.5 rounded-panel border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusChip {...returnChip(r)} />
        <span className="text-[13px] text-ink-3">Started {shortDate(new Date(r.createdAt), store)} · {REASON_LABEL[r.reason]}</span>
      </div>
      <p className="m-0 text-[15px] font-semibold">{itemsText(r)}</p>
      <p className="m-0 text-[14px] leading-[1.5] text-ink-2">{lead}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-2 pt-2.5 text-[13px] text-ink-3">
        <span className="tabular-nums">
          {r.status === 'rejected' || r.status === 'cancelled' ? `Not refunded (${money})` : `Refund ${money}`} · {refundBreakdown(r, currency)}
        </span>
        {cancel ? (
          <ConfirmAction
            action={cancel}
            label="Cancel return"
            prompt="Cancel this return? You can start a new one while the return window is open."
            confirmLabel="Yes, cancel it"
            pendingLabel="Cancelling…"
            cancelLabel="Keep return"
          />
        ) : null}
      </div>
    </article>
  );
}
