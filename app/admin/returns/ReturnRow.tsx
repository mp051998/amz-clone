import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass } from '@/components/lib/controls';
import { StatusChip } from '@/components/orders/Tracking';
import { itemsText, REASON_LABEL, refundBreakdown, returnChip } from '@/components/orders/Returns';
import { paymentText } from '@/components/orders/format';
import { pickupDayText, pointText } from '@/components/orders/ReturnMethod';
import { canRetryReturnRefund, type AdminReturn } from '@/lib/data/admin-returns';
import { balanceMethod } from '@/lib/data/balance';
import { nothingSentBack, STORE_FAULT_REASONS } from '@/lib/data/returns';
import { formatMoney } from '@/lib/marketplaces';
import { adminTime } from '../orders/labels';
import { SubmitButton } from '@/components/primitives/SubmitButton';

/**
 * One return with its admin moves (receive, reject with a note, retry the refund). The returns list
 * shows the order it belongs to; the order page leaves that out (`showOrder={false}`).
 */
export function ReturnRow({
  r,
  store,
  to,
  act,
  showOrder = true,
}: {
  r: AdminReturn;
  store: Parameters<typeof adminTime>[1];
  to: (path: string) => string;
  act: (id: string, move: string) => (formData?: FormData) => Promise<void>;
  showOrder?: boolean;
}) {
  const money = (minor: number) => formatMoney(minor, r.order.currency);
  const refund = money(r.refundMinor);
  // where the money goes, in the admin's words (the shopper sees "your …")
  const dest = r.refundToBalance
    ? `${paymentText(balanceMethod(r.order.market), '')} (shopper’s choice)`
    : r.order.paymentMethod === 'cod' ? 'Bank transfer (paid on delivery)' : paymentText(r.order.paymentMethod, r.order.paymentLabel) || 'Card';
  const fault = (STORE_FAULT_REASONS as readonly string[]).includes(r.reason);
  // rejected or cancelled: nothing was refunded
  const unpaid = r.status === 'rejected' || r.status === 'cancelled';
  const swap = r.replacement;
  const when =
    r.status === 'requested'
      ? `Started ${adminTime(r.createdAt, store)} · drop off by ${adminTime(r.dropoffBy, store)}`
      : r.status === 'received'
        ? `Received ${adminTime(r.receivedAt ?? r.createdAt, store)}${r.refund?.refundedAt ? ` · refunded ${adminTime(r.refund.refundedAt, store)}` : ''}`
        : r.status === 'rejected'
          ? `Rejected ${adminTime(r.rejectedAt ?? r.createdAt, store)}`
          : `Cancelled by the shopper ${adminTime(r.cancelledAt ?? r.createdAt, store)}`;

  return (
    <article aria-labelledby={`rt-${r.id}`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {showOrder ? (
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
              <a href={to(`/admin/orders/${encodeURIComponent(r.order.id)}`)} className="font-mono text-ink-2 underline underline-offset-2 hover:text-ink">{r.order.id}</a>
              <span aria-hidden>·</span>
              <span>{r.customer.name || r.customer.email || 'Customer'}</span>
              {r.customer.email && r.customer.name ? <a href={`mailto:${r.customer.email}`} className="break-all text-ink-3 underline underline-offset-2">{r.customer.email}</a> : null}
            </span>
          ) : null}
          <strong id={`rt-${r.id}`} className="text-[16px] font-semibold leading-[1.35]">{itemsText(r)}</strong>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <StatusChip {...returnChip(r)} />
          <StatusChip label={REASON_LABEL[r.reason]} tone={fault ? 'warn' : 'neutral'} />
          {swap ? <StatusChip label="Replacement" tone="neutral" /> : null}
        </span>
      </div>

      {r.comment ? <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55] text-ink-2">“{r.comment}”</p> : null}
      {r.rejectNote ? <p className="m-0 text-[14px] text-ink-2">Note to shopper: {r.rejectNote}</p> : null}

      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-5 gap-y-2 text-[14px]">
        {swap ? (
          <>
            <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Resolution</dt><dd className="m-0 font-semibold">Replacement, no charge</dd></div>
            <div className="flex flex-col">
              <dt className="text-[13px] text-ink-3">Replacement</dt>
              <dd className="m-0">{r.status === 'cancelled' ? 'Not sent' : `Ships ${adminTime(swap.shippedAt, store)} · arrives ${adminTime(swap.deliveredAt, store)}`}</dd>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col"><dt className="text-[13px] text-ink-3">{unpaid ? 'Asked for' : 'Refund'}</dt><dd className={`m-0 font-semibold tabular-nums ${unpaid ? 'text-ink-3 line-through' : ''}`}>{refund}</dd></div>
            <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Refund to</dt><dd className="m-0">{dest}</dd></div>
            <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Breakdown</dt><dd className="m-0 tabular-nums">{refundBreakdown(r, r.order.currency)}</dd></div>
          </>
        )}
        {nothingSentBack(r.reason) ? null : (
          <div className="flex flex-col">
            <dt className="text-[13px] text-ink-3">Coming back by</dt>
            <dd className="m-0">
              {r.pickupOn ? `Courier pickup, ${pickupDayText(r.pickupOn, store)}` : r.dropoffPoint ? `Drop-off at ${pointText(r.dropoffPoint)}` : 'Drop-off, any point'}
            </dd>
          </div>
        )}
        <div className="flex flex-col"><dt className="text-[13px] text-ink-3">{r.pickupOn ? 'Return code' : 'Drop-off code'}</dt><dd className="m-0 font-mono tracking-[0.06em]">{r.dropoffCode}</dd></div>
        {r.stripeRefundId ? (
          <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Stripe refund</dt><dd className="m-0 break-all font-mono text-[13px]">{r.stripeRefundId}</dd></div>
        ) : null}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-3">
        <span className="text-[13px] text-ink-3">{when}{showOrder ? ` · order total ${money(r.order.totalMinor)}` : ''}</span>
        {r.status === 'requested' ? (
          <div className="flex flex-wrap items-start gap-2.5">
            <ConfirmAction
              action={act(r.id, 'receive')}
              label="Mark received"
              prompt={swap ? <>Items back? This restocks them. The shopper already has their replacement, so nothing is refunded.</> : <>Items back? This restocks them and refunds {refund} ({dest}).</>}
              confirmLabel={swap ? 'Yes, received' : 'Yes, refund'}
              pendingLabel={swap ? 'Saving…' : 'Refunding…'}
              cancelLabel="Not yet"
            />
            <details className="group">
              <summary className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Reject</summary>
              <form action={act(r.id, 'reject')} className="mt-2.5 flex w-[min(360px,80vw)] flex-col gap-2">
                <label htmlFor={`note-${r.id}`} className="text-[13px] font-semibold">Note to the shopper <span className="font-normal text-ink-3">(optional)</span></label>
                <textarea id={`note-${r.id}`} name="note" rows={2} maxLength={500} className={`${fieldClass} h-auto py-2 leading-normal`} placeholder="e.g. The item came back used" />
                <SubmitButton variant="dark" size="sm" className="self-start">Reject return</SubmitButton>
              </form>
            </details>
          </div>
        ) : canRetryReturnRefund(r) ? (
          <form action={act(r.id, 'refund')}>
            <SubmitButton variant="secondary" size="sm">Retry refund</SubmitButton>
          </form>
        ) : null}
      </div>
    </article>
  );
}
