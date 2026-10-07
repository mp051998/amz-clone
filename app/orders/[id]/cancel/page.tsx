import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProductFrame } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { lcFirst, orderView, stepTime } from '@/components/orders/format';
import { refundTo } from '@/components/orders/Returns';
import { cancelMyItems } from '@/app/actions/order';
import { readUser } from '@/lib/auth';
import { messageFor } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Cancel items · Store' };

const ERROR_TEXT: Record<string, string> = {
  invalid_input: 'Choose at least one item to cancel.',
};

/** /orders/:id/cancel: tick the items to cancel before the order ships; the rest keep coming. */
export default async function CancelItemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const page = `/orders/${encodeURIComponent(id)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(`${page}/cancel`)}`));
  const order = await getOrder(await db(), id);
  if (!order) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `${page}/cancel`));

  const now = new Date();
  const money = (minor: number) => formatMoney(minor, order.currency);
  const view = orderView(order, store, now);
  const open = order.status === 'placed' && !!view.cancelUntil;
  const errorText = error ? ERROR_TEXT[error] ?? messageFor(error) ?? 'Something went wrong. Please try again.' : null;
  const refundNote =
    order.paymentMethod === 'cod'
      ? 'Nothing has been charged yet: you’ll pay only for what’s delivered.'
      : `We’ll refund what the cancelled items cost, and the tax on them, to ${refundTo(order.paymentMethod, order.paymentLabel)}.`;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-[clamp(16px,3vw,24px)] pb-[120px] pt-8">
        <nav aria-label="Breadcrumb" className="text-[14px] text-ink-2">
          <a href={sp('/orders')} className="text-ink-2 underline underline-offset-2 hover:text-ink">Your orders</a>
          <span aria-hidden> › </span>
          <a href={sp(page)} className="font-mono text-ink-2 underline underline-offset-2 hover:text-ink">{order.id}</a>
          <span aria-hidden> › </span>
          <span className="text-ink">Cancel items</span>
        </nav>
        <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Cancel items</h1>

        {!open ? (
          <>
            <Alert tone="info">
              {order.status === 'cancelled'
                ? 'This order is already cancelled.'
                : order.status === 'awaiting_payment'
                  ? 'This order hasn’t been paid for yet. You can cancel it from the order page.'
                  : 'These items have already shipped, so they can’t be cancelled. You can return them once they arrive.'}
            </Alert>
            <a href={sp(page)} className={`${buttonClasses({ variant: 'secondary' })} self-start`}>Back to the order</a>
          </>
        ) : (
          <form action={cancelMyItems.bind(null, order.id)} className="flex flex-col gap-5">
            <p className="m-0 text-[15px] text-ink-2">
              You can cancel items until the order ships, {lcFirst(stepTime(view.cancelUntil!, store, now))}. {refundNote}
            </p>
            {errorText ? <Alert tone="error">{errorText}</Alert> : null}

            <fieldset className="m-0 flex flex-col overflow-hidden rounded-panel border border-line bg-surface p-0">
              <legend className="sr-only">Items to cancel</legend>
              <h2 className="m-0 px-[18px] pb-1 pt-4 text-[16px] font-semibold">Which items do you want to cancel?</h2>
              {order.items.map((it) => {
                const fieldId = `cancel-${it.productId}`;
                return (
                  <div key={it.productId} className="flex items-center gap-3.5 border-t border-line-2 px-[18px] py-3.5 first-of-type:border-t-0">
                    <input
                      id={fieldId}
                      type="checkbox"
                      name="item"
                      value={it.productId}
                      defaultChecked={order.items.length === 1}
                      className="h-[18px] w-[18px] flex-none cursor-pointer accent-ink"
                    />
                    <span className="w-14 flex-none" aria-hidden>
                      <ProductFrame src={it.image} alt="" aspect="1/1" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <label htmlFor={fieldId} className="line-clamp-2 text-[15px] font-semibold">{it.title}</label>
                      <span className="text-[13px] text-ink-3">
                        Qty {it.qty} · {money((it.unitPriceMinor - (it.unitDiscountMinor ?? 0)) * it.qty)}{it.unitDiscountMinor ? ' after coupon' : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </fieldset>
            {order.items.length > 1 ? (
              <p className="m-0 text-[13px] text-ink-3">Cancelling every item cancels the whole order. Delivery charges stay as they are for the items still coming.</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2.5">
              <button type="submit" className={buttonClasses({ variant: 'primary', size: 'lg' })}>Cancel checked items</button>
              <a href={sp(page)} className={buttonClasses({ variant: 'link' })}>Keep everything</a>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
