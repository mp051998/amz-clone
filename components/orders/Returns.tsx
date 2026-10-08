import type { ReactNode } from 'react';
import { ConfirmAction } from '../admin/ConfirmAction';
import { formatMoney } from '@/lib/marketplaces';
import type { CurrencyCode } from '@/lib/contracts';
import { balanceMethod } from '@/lib/data/balance';
import { nothingSentBack, type ReturnSummary } from '@/lib/data/returns';
import type { Market, OrderReturn, PaymentMethod, ReturnReason } from '@/lib/types';
import { pickupDayText } from './ReturnMethod';
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
  not_received: 'Package didn’t arrive',
  atoz_claim: 'A-to-z Guarantee claim',
};

/** Where a refund goes, mid-sentence: the card, the balance paid with, or (pay on delivery) the bank. */
export function refundTo(method: PaymentMethod, label: string): string {
  if (method === 'giftcard') return 'your gift card balance';
  if (method === 'amazonpay') return 'your wallet balance';
  if (method === 'cod') return 'your bank account';
  if (method === 'paylater') return 'your Pay Later account';
  return label || (method === 'card' ? 'your card' : 'your payment method');
}

/** Where a return's refund goes, mid-sentence: the store balance when the shopper chose it, else as `refundTo`. */
export function returnRefundTo(r: Pick<OrderReturn, 'refundToBalance'>, market: Market, method: PaymentMethod, label: string): string {
  return r.refundToBalance ? refundTo(balanceMethod(market), '') : refundTo(method, label);
}

/** The orders-list chip for an order's most pressing return (see `returnSummaries`). */
export const RETURN_SUMMARY_CHIP: Record<ReturnSummary, { label: string; tone: ChipTone }> = {
  requested: { label: 'Return started', tone: 'warn' },
  replacement: { label: 'Replacement', tone: 'good' },
  refund_pending: { label: 'Return received', tone: 'warn' },
  refunded: { label: 'Return refunded', tone: 'good' },
};

/** One chip for where a return stands. */
export function returnChip(r: OrderReturn, now: Date = new Date()): { label: string; tone: ChipTone } {
  if (r.replacement && (r.status === 'requested' || r.status === 'received')) {
    return Date.parse(r.replacement.deliveredAt) <= now.getTime()
      ? { label: 'Replacement delivered', tone: 'good' }
      : { label: 'Replacement on its way', tone: 'warn' };
  }
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
  return r.items.map((i) => `${i.title}${i.size ? ` (size ${i.size})` : ''}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ');
}

/** "Items $20.00 · tax $1.60 · delivery $5.99 · protection plan $7.99" (parts that are zero are left out). */
export function refundBreakdown(r: OrderReturn, currency: CurrencyCode): string {
  const m = (n: number) => formatMoney(n, currency);
  return [
    `Items ${m(r.itemsMinor)}`,
    r.taxMinor ? `tax ${m(r.taxMinor)}` : '',
    r.shipMinor ? `delivery ${m(r.shipMinor)}` : '',
    r.protectionMinor ? `protection plan ${m(r.protectionMinor)}` : '',
    r.wrapMinor ? `gift wrap ${m(r.wrapMinor)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * How an open return goes back, as a sentence: collected on its pickup day, or dropped off by the
 * deadline at the point chosen (or any), with its code. `thing` is "it" or "the original".
 */
export function sendBackText(r: OrderReturn, store: StoreDates, thing: string, pickupFrom?: string): ReactNode {
  const code = <strong className="font-mono tracking-[0.06em]">{r.dropoffCode}</strong>;
  if (r.pickupOn) {
    return (
      <>
        We’ll collect {thing}{pickupFrom ? ` from ${pickupFrom}` : ''} on <strong>{pickupDayText(r.pickupOn, store)}</strong>. Have it packed and ready, and give the courier this code: {code}.
      </>
    );
  }
  const by = <strong>{longDate(new Date(r.dropoffBy), store)}</strong>;
  const p = r.dropoffPoint;
  if (p) {
    return (
      <>
        Drop {thing} off by {by} at <strong>{p.name}</strong>, {p.line1}, {p.city} ({p.hours}), and {p.kind === 'locker' ? 'enter' : 'show'} this code: {code}.
      </>
    );
  }
  return (
    <>
      Drop {thing} off by {by} at any drop-off point and show this code: {code}.
    </>
  );
}

/** What the shopper needs to know about one return, and what they can do next. */
export function ReturnCard({
  r,
  currency,
  market,
  method,
  label,
  store,
  now = new Date(),
  cancel,
  pickupFrom,
  change,
}: {
  r: OrderReturn;
  currency: CurrencyCode;
  market: Market;
  method: PaymentMethod;
  label: string;
  store: StoreDates;
  now?: Date;
  /** bound "cancel return" action, while it can be cancelled */
  cancel?: () => Promise<void>;
  /** the delivery address a courier collects a pickup from */
  pickupFrom?: string;
  /** "Change return method", while it's on its way back */
  change?: ReactNode;
}) {
  const money = formatMoney(r.refundMinor, currency);
  const to = returnRefundTo(r, market, method, label);
  // an order paid partly from the balance: the part of the refund the payment method didn't pay is back on the balance
  const bal = r.balanceRefundMinor ?? 0;
  const toBalance = refundTo(balanceMethod(market), '');
  const cardMoney = formatMoney(r.refundMinor - bal, currency);
  const balMoney = formatMoney(bal, currency);
  // a missing package or a granted claim has nothing to send back, so nothing to receive
  const got = nothingSentBack(r.reason) ? '' : 'We received your return. ';
  let lead: ReactNode;
  if (r.replacement && (r.status === 'requested' || r.status === 'received')) {
    const arrives = new Date(r.replacement.deliveredAt);
    const swap =
      arrives.getTime() <= now.getTime()
        ? <>Your replacement was delivered on {shortDate(arrives, store)}.</>
        : <>Your replacement {Date.parse(r.replacement.shippedAt) <= now.getTime() ? 'has shipped and ' : ''}arrives by <strong>{longDate(arrives, store)}</strong>, at no charge.</>;
    lead =
      r.reason === 'not_received' ? (
        <>{swap} There’s nothing to send back.</>
      ) : r.status === 'requested' ? (
        <>
          {swap} {sendBackText(r, store, 'the original', pickupFrom)}
        </>
      ) : (
        <>{swap} We’ve received the original, so there’s nothing more to do.</>
      );
  } else if (r.status === 'requested') {
    lead = (
      <>
        {sendBackText(r, store, 'it', pickupFrom)} We’ll refund {money} to {to} once it reaches us.
      </>
    );
  } else if (r.status === 'rejected') {
    const note = r.rejectNote && !/[.!?]$/.test(r.rejectNote) ? `${r.rejectNote}.` : r.rejectNote;
    lead = <>We couldn’t accept this return{note ? <>: {note}</> : '.'} Contact customer service if you think that’s wrong.</>;
  } else if (r.status === 'cancelled') {
    lead = (
      <>
        You cancelled this {r.resolution === 'replacement' ? 'replacement' : 'return'}
        {r.cancelledAt ? ` on ${shortDate(new Date(r.cancelledAt), store)}` : ''}. {r.resolution === 'replacement' ? 'Nothing was sent.' : 'Nothing was refunded.'}
      </>
    );
  } else if (r.refund?.status === 'succeeded' && bal) {
    const on = r.refund.refundedAt ? ` on ${shortDate(new Date(r.refund.refundedAt), store)}` : '';
    lead =
      bal >= r.refundMinor ? (
        <>{money} refunded to {toBalance}{on}.</>
      ) : (
        <>
          {cardMoney} refunded to {to} and {balMoney} to {toBalance}{on}.{method === 'card' ? ' Card refunds take 5–10 business days to show up.' : ''}
        </>
      );
  } else if (r.refund && bal) {
    lead = (
      <>
        {got}{balMoney} is back on {toBalance}; the refund of {cardMoney} to {to}{' '}
        {r.refund.status === 'failed' ? 'is delayed. We’re retrying it, so there’s nothing you need to do.' : 'is on its way.'}
      </>
    );
  } else if (r.refund?.status === 'succeeded') {
    lead = (
      <>
        {money} refunded to {to}
        {r.refund.refundedAt ? ` on ${shortDate(new Date(r.refund.refundedAt), store)}` : ''}.
        {method === 'card' && !r.refundToBalance ? ' Card refunds take 5–10 business days to show up.' : ''}
      </>
    );
  } else if (r.refund?.status === 'failed') {
    lead = <>{got}The refund of {money} to {to} is delayed; we’re retrying it, so there’s nothing you need to do.</>;
  } else {
    lead = <>{got}The refund of {money} to {to} is on its way.</>;
  }

  return (
    <article aria-label="Return" className="flex flex-col gap-2.5 rounded-panel border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusChip {...returnChip(r, now)} />
        <span className="text-[13px] text-ink-3">{r.reason === 'atoz_claim' ? 'Granted' : r.reason === 'not_received' ? 'Reported' : 'Started'} {shortDate(new Date(r.createdAt), store)} · {REASON_LABEL[r.reason]}</span>
      </div>
      <p className="m-0 text-[15px] font-semibold">{itemsText(r)}</p>
      <p className="m-0 text-[14px] leading-[1.5] text-ink-2">{lead}</p>
      {change}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-2 pt-2.5 text-[13px] text-ink-3">
        <span className="tabular-nums">
          {r.resolution === 'replacement'
            ? 'Replacement · no charge'
            : `${r.status === 'rejected' || r.status === 'cancelled' ? `Not refunded (${money})` : `Refund ${money}`} · ${refundBreakdown(r, currency)}`}
        </span>
        {cancel ? (
          <ConfirmAction
            action={cancel}
            label={r.resolution === 'replacement' ? 'Cancel replacement' : 'Cancel return'}
            prompt={
              r.resolution === 'replacement'
                ? 'Cancel this replacement? We won’t send it, and you can start a new return while the return window is open.'
                : 'Cancel this return? You can start a new one while the return window is open.'
            }
            confirmLabel="Yes, cancel it"
            pendingLabel="Cancelling…"
            cancelLabel={r.resolution === 'replacement' ? 'Keep replacement' : 'Keep return'}
          />
        ) : null}
      </div>
    </article>
  );
}
