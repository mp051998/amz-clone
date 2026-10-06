import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { ProductFrame } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { FactsCard, StatusChip, Timeline } from '@/components/orders/Tracking';
import { paymentText } from '@/components/orders/format';
import { trackingSteps } from '@/lib/decision/tracking';
import { canRetryRefund, getAdminOrder, type AdminOrder } from '@/lib/data/admin-orders';
import { listOrderReturns } from '@/lib/data/admin-returns';
import { messageFor } from '@/lib/data/errors';
import { formatMoney } from '@/lib/marketplaces';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminPage } from '../../guard';
import { AdminFrame, AdminOnly } from '../../ui';
import { orderAction } from '../actions';
import { returnAction } from '../../returns/actions';
import { ReturnRow } from '../../returns/ReturnRow';
import { CANCEL_REASON, REFUND_CHIP, REFUND_LABEL, STAGE_CHIP, adminTime } from '../labels';

export const metadata: Metadata = { title: 'Order · Admin · Store' };

const DONE: Record<string, string> = {
  ship: 'Marked shipped. The delivery day moved up to match.',
  deliver: 'Marked delivered.',
  cancel: 'Order cancelled and its stock returned.',
  refund: 'Refund sent to Stripe again.',
  return_receive: 'Return received. The stock is back and the refund went through.',
  return_receive_pending: 'Return received and the stock is back. The card refund is under way.',
  return_receive_failed: 'Return received and the stock is back, but the card refund didn’t go through. Retry it below.',
  return_reject: 'Return rejected. The shopper sees your note.',
  return_refund: 'Return refund sent again.',
};

function cancelPrompt(o: AdminOrder, total: string) {
  if (o.status === 'awaiting_payment') return 'Cancel this unpaid order? Its reserved stock is released.';
  if (o.paymentMethod === 'cod') return 'Cancel this order? Nothing was charged (pay on delivery).';
  if (o.paymentMethod === 'card') return `Cancel this order and refund ${total} to the customer’s card?`;
  return `Cancel this order and refund ${total} to ${paymentText(o.paymentMethod, o.paymentLabel)}?`;
}

/** /admin/orders/:id — an order's items, customer, payment, delivery timeline and refund, with the admin moves. */
export default async function AdminOrderPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { id } = await params;
  const { done, error } = await searchParams;
  const { store, admin } = await adminPage(`/admin/orders/${id}`);
  if (!admin) return <AdminOnly store={store} />;
  const client = await db();
  const [order, returns] = await Promise.all([getAdminOrder(client, id), listOrderReturns(client, id)]);
  if (!order) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `/admin/orders/${encodeURIComponent(order.id)}`));

  const now = new Date();
  const money = (minor: number) => formatMoney(minor, order.currency);
  const to = (path: string) => storePath(store, path);
  const act = (move: string) => orderAction.bind(null, order.id, move);
  const steps = trackingSteps(order, now, store.dates.timeZone);
  const stage = order.stage;
  const open = order.status === 'placed';
  const canShip = open && stage === 'preparing';
  const canDeliver = open && stage !== 'delivered';
  const canCancel = order.status === 'awaiting_payment' || (open && stage !== 'delivered');
  const retry = canRetryRefund(order);
  const refund = order.refund;
  const refundChip = refund ? REFUND_CHIP[refund.status] : undefined;
  const s = order.shipTo;
  const openReturns = returns.filter((r) => r.status === 'requested').length;
  const actReturn = (rid: string, move: string) => returnAction.bind(null, rid, move, 'order');

  return (
    <AdminFrame
      store={store}
      path={`/admin/orders/${order.id}`}
      title={`Order ${order.id}`}
      lede={<>Placed {adminTime(order.placedAt ?? order.createdAt, store)} · <a href={to('/admin/orders')} className="text-ink underline underline-offset-2">All orders</a></>}
    >
      {error ? (
        <Alert tone="error">{messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert>
      ) : done && DONE[done] ? (
        <Alert tone={done === 'return_receive_failed' ? 'error' : 'success'}>{DONE[done]}</Alert>
      ) : null}

      <section aria-label="Status and actions" className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4">
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusChip {...STAGE_CHIP[stage]} />
          {refundChip ? <StatusChip {...refundChip} /> : null}
        </span>
        <div className="flex flex-wrap items-center gap-2.5">
          {canShip ? (
            <form action={act('ship')}><button type="submit" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Mark shipped now</button></form>
          ) : null}
          {canDeliver ? (
            <form action={act('deliver')}><button type="submit" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Mark delivered now</button></form>
          ) : null}
          {retry ? (
            <form action={act('refund')}><button type="submit" className={buttonClasses({ variant: 'primary', size: 'sm' })}>Retry refund</button></form>
          ) : null}
          {canCancel ? (
            <ConfirmAction
              action={act('cancel')}
              label={order.paymentMethod === 'card' && open ? 'Cancel & refund' : 'Cancel order'}
              prompt={cancelPrompt(order, money(order.totals.totalMinor))}
              confirmLabel="Yes, cancel it"
              pendingLabel="Cancelling…"
              cancelLabel="Keep order"
            />
          ) : null}
          {!canShip && !canDeliver && !canCancel && !retry ? (
            <span className="text-[14px] text-ink-3">
              {openReturns ? <a href="#returns-h" className="text-ink underline underline-offset-2">{openReturns === 1 ? 'A return is waiting' : `${openReturns} returns are waiting`}</a> : 'Nothing left to do on this order.'}
            </span>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="flex flex-col rounded-panel border border-line bg-surface p-[22px]" aria-labelledby="timeline-h">
            <h2 id="timeline-h" className="m-0 mb-3.5 text-[18px] font-semibold">Delivery</h2>
            <Timeline steps={steps} store={store} now={now} />
          </section>

          <section className="overflow-hidden rounded-panel border border-line bg-surface" aria-labelledby="items-h">
            <h2 id="items-h" className="m-0 px-[18px] pb-1 pt-4 text-[16px] font-semibold">Items</h2>
            {order.items.map((it) => (
              <div key={it.productId} className="flex flex-wrap items-center gap-3.5 border-t border-line-2 px-[18px] py-3.5 first-of-type:border-t-0">
                <span className="w-14 flex-none" aria-hidden><ProductFrame src={it.image} alt="" aspect="1/1" /></span>
                <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
                  <a href={to(`/admin/products/${encodeURIComponent(it.productId)}`)} className="line-clamp-2 text-[15px] font-semibold text-ink no-underline hover:underline">{it.title}</a>
                  <span className="text-[13px] text-ink-3">{money(it.unitPriceMinor)} × {it.qty} · Sold by {it.seller}{it.unitDiscountMinor ? ` · coupon −${money(it.unitDiscountMinor * it.qty)}` : ''}</span>
                </div>
                <strong className="tabular-nums">{money(it.unitPriceMinor * it.qty)}</strong>
              </div>
            ))}
            <dl className="m-0 flex flex-col gap-1 border-t border-line-2 px-[18px] py-3.5 text-[14px]">
              <div className="flex justify-between"><dt className="text-ink-2">Items</dt><dd className="m-0 tabular-nums">{money(order.totals.subtotalMinor)}</dd></div>
              {order.totals.discountMinor ? (
                <div className="flex justify-between"><dt className="text-ink-2">Coupon savings</dt><dd className="m-0 tabular-nums">−{money(order.totals.discountMinor)}</dd></div>
              ) : null}
              <div className="flex justify-between"><dt className="text-ink-2">Delivery</dt><dd className="m-0 tabular-nums">{order.totals.shipMinor === 0 ? 'FREE' : money(order.totals.shipMinor)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Tax</dt><dd className="m-0 tabular-nums">{money(order.totals.taxMinor)}</dd></div>
              <div className="flex justify-between font-bold"><dt>Total</dt><dd className="m-0 tabular-nums">{money(order.totals.totalMinor)}</dd></div>
            </dl>
          </section>

          {returns.length ? (
            <section className="flex flex-col gap-3" aria-labelledby="returns-h">
              <h2 id="returns-h" className="m-0 scroll-mt-24 text-[18px] font-semibold">
                Returns <span className="font-normal text-ink-3">({returns.length})</span>
              </h2>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {returns.map((r) => (
                  <li key={r.id}>
                    <ReturnRow r={r} store={store} to={to} act={actReturn} showOrder={false} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <FactsCard
            rows={[
              { label: 'Customer', value: order.customer.name || s.name },
              { label: 'Email', value: order.customer.email ? <a href={`mailto:${order.customer.email}`} className="break-all text-ink underline underline-offset-2">{order.customer.email}</a> : '—' },
              { label: 'Deliver to', value: [s.name, s.line1, s.line2, s.landmark, `${s.city}, ${s.state} ${s.postcode}`].filter(Boolean).join(', ') },
              { label: 'Phone', value: s.phone },
              ...(s.instructions ? [{ label: 'Instructions', value: <span className="whitespace-pre-line">{s.instructions}</span> }] : []),
              { label: 'Delivery', value: order.shipSpeed === 'fast' ? 'Fast · evening run' : 'Standard' },
              ...(order.gift ? [{ label: 'Gift note', value: order.gift.message ? <span className="whitespace-pre-line">{order.gift.message}</span> : 'Gift, no note' }] : []),
            ]}
          />
          <FactsCard
            rows={[
              { label: 'Payment', value: paymentText(order.paymentMethod, order.paymentLabel) },
              ...(order.stripePaymentIntent ? [{ label: 'Stripe payment', value: <span className="break-all font-mono text-[13px]">{order.stripePaymentIntent}</span> }] : []),
              ...(order.cancelledAt ? [{ label: 'Cancelled', value: `${adminTime(order.cancelledAt, store)}${order.cancelReason ? ` · ${CANCEL_REASON[order.cancelReason].toLowerCase()}` : ''}` }] : []),
              ...(refund
                ? [
                    { label: 'Refund', value: REFUND_LABEL[refund.status] },
                    ...(refund.status !== 'not_charged' ? [{ label: 'Refund amount', value: <span className="tabular-nums">{money(refund.amountMinor)}</span> }] : []),
                    ...(refund.refundedAt ? [{ label: 'Refunded', value: adminTime(refund.refundedAt, store) }] : []),
                    ...(order.stripeRefundId ? [{ label: 'Stripe refund', value: <span className="break-all font-mono text-[13px]">{order.stripeRefundId}</span> }] : []),
                  ]
                : []),
            ]}
          />
          {refund?.status === 'failed' ? (
            <Alert tone="warning">Stripe didn’t complete this refund. Retry it, or check the payment in the Stripe dashboard.</Alert>
          ) : null}
        </div>
      </div>
    </AdminFrame>
  );
}
