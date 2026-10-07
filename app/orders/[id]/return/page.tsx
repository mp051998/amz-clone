import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProductFrame } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass, selectClass } from '@/components/lib/controls';
import { longDate } from '@/components/orders/format';
import { REASON_LABEL, refundTo } from '@/components/orders/Returns';
import { startReturn } from '@/app/actions/returns';
import { readUser } from '@/lib/auth';
import { messageFor } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';
import { canStartReturn, getOrderReturns, RETURN_REASONS } from '@/lib/data/returns';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Return items · Store' };

const FIELD_ERROR: Record<string, string> = {
  items: 'Choose at least one item to return, up to the quantity that’s left.',
  reason: 'Choose why you’re returning it.',
  comment: 'Keep the comment under 1,000 characters.',
  resolution: 'Replacements are for items that arrived damaged, don’t work, are wrong, have parts missing or aren’t as described. Choose one of those reasons, or a refund.',
};

/** /orders/:id/return: pick items and quantities, say why, start the return. */
export default async function ReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; field?: string }>;
}) {
  const { id } = await params;
  const { error, field } = await searchParams;
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const page = `/orders/${encodeURIComponent(id)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(`${page}/return`)}`));
  const client = await db();
  const [order, returns] = await Promise.all([getOrder(client, id), getOrderReturns(client, id)]);
  if (!order || !returns) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `${page}/return`));

  const now = new Date();
  const money = (minor: number) => formatMoney(minor, order.currency);
  const open = canStartReturn(returns, now);
  const lines = order.items.filter((it) => (returns.returnable[it.productId] ?? 0) > 0);
  const replaceable = lines.filter((it) => (returns.replaceable[it.productId] ?? 0) > 0);
  const errorText = error ? (error === 'invalid_input' && field && FIELD_ERROR[field]) || messageFor(error) || 'Something went wrong. Please try again.' : null;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-[clamp(16px,3vw,24px)] pb-[120px] pt-8">
        <nav aria-label="Breadcrumb" className="text-[14px] text-ink-2">
          <a href={sp('/orders')} className="text-ink-2 underline underline-offset-2 hover:text-ink">Your orders</a>
          <span aria-hidden> › </span>
          <a href={sp(page)} className="font-mono text-ink-2 underline underline-offset-2 hover:text-ink">{order.id}</a>
          <span aria-hidden> › </span>
          <span className="text-ink">Return</span>
        </nav>
        <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Return items</h1>

        {!open ? (
          <>
            <Alert tone="info">
              {!returns.delivered
                ? 'You can return items once they’ve been delivered.'
                : returns.returnBy && Date.parse(returns.returnBy) < now.getTime()
                  ? `The return window for this order closed on ${longDate(new Date(returns.returnBy), store)}.`
                  : 'Every item in this order is already being returned.'}
            </Alert>
            <a href={sp(page)} className={`${buttonClasses({ variant: 'secondary' })} self-start`}>Back to the order</a>
          </>
        ) : (
          <form action={startReturn.bind(null, order.id)} className="flex flex-col gap-5">
            <p className="m-0 text-[15px] text-ink-2">
              Eligible until {longDate(new Date(returns.returnBy!), store)}. Refunds go to {refundTo(order.paymentMethod, order.paymentLabel)} once the items reach us.
            </p>
            {errorText ? <Alert tone="error">{errorText}</Alert> : null}

            <fieldset className="m-0 flex flex-col overflow-hidden rounded-panel border border-line bg-surface p-0">
              <legend className="sr-only">Items to return</legend>
              <h2 className="m-0 px-[18px] pb-1 pt-4 text-[16px] font-semibold">What are you returning?</h2>
              {lines.map((it) => {
                const left = returns.returnable[it.productId];
                const fieldId = `qty-${it.productId}`;
                return (
                  <div key={it.productId} className="flex flex-wrap items-center gap-3.5 border-t border-line-2 px-[18px] py-3.5 first-of-type:border-t-0">
                    <span className="w-14 flex-none" aria-hidden>
                      <ProductFrame src={it.image} alt="" aspect="1/1" />
                    </span>
                    <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                      <label htmlFor={fieldId} className="line-clamp-2 text-[15px] font-semibold">{it.title}</label>
                      <span className="text-[13px] text-ink-3">
                        {money(it.unitPriceMinor - (it.unitDiscountMinor ?? 0))} each{it.unitDiscountMinor ? ' after coupon' : ''} · {left === it.qty ? `${it.qty} ordered` : `${left} of ${it.qty} left to return`}
                      </span>
                    </div>
                    <select id={fieldId} name={`qty:${it.productId}`} defaultValue={lines.length === 1 ? String(left) : '0'} className={selectClass}>
                      {Array.from({ length: left + 1 }, (_, n) => (
                        <option key={n} value={n}>{n === 0 ? 'Not returning' : `Return ${n}`}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="return-reason" className="text-[14px] font-semibold">Why are you returning it?</label>
              <select id="return-reason" name="reason" required defaultValue="" className={`${selectClass} w-full`}>
                <option value="" disabled>Choose a reason</option>
                {RETURN_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
              </select>
              <span className="text-[13px] text-ink-3">
                If it arrived damaged, doesn’t work, is the wrong item, has parts missing or isn’t as described, we refund your share of the delivery charge too.
                {order.items.some((it) => it.protectionMinor) ? ' Returning an item with a protection plan cancels the plan and refunds it with the item.' : null}
              </span>
            </div>

            {replaceable.length ? (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1.5 p-0 text-[14px] font-semibold">What would you like?</legend>
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input type="radio" name="resolution" value="refund" defaultChecked className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>
                    <span className="font-semibold">A refund</span>
                    <span className="block text-[13px] text-ink-3">To {refundTo(order.paymentMethod, order.paymentLabel)}, once the items reach us.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input type="radio" name="resolution" value="replacement" className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>
                    <span className="font-semibold">A replacement</span>
                    <span className="block text-[13px] text-ink-3">
                      The same item again at no charge, sent right away. Only if it arrived damaged, doesn’t work, is the wrong item, has parts missing or isn’t as described
                      {replaceable.length < lines.length ? `; available for ${replaceable.map((it) => it.title).join(', ')}` : ''}.
                    </span>
                  </span>
                </label>
              </fieldset>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="return-comment" className="text-[14px] font-semibold">Anything else? <span className="font-normal text-ink-3">(optional)</span></label>
              <textarea id="return-comment" name="comment" maxLength={1000} rows={3} className={`${fieldClass} h-auto py-2.5 leading-normal`} placeholder="What went wrong, or anything we should know" />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button type="submit" className={buttonClasses({ variant: 'primary', size: 'lg' })}>Start return</button>
              <a href={sp(page)} className={buttonClasses({ variant: 'link' })}>Cancel</a>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
