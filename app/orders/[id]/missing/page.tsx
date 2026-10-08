import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProductFrame } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass, selectClass } from '@/components/lib/controls';
import { longDate, returnUntilText, shortDate } from '@/components/orders/format';
import { refundTo } from '@/components/orders/Returns';
import { reportItemsMissing } from '@/app/actions/returns';
import { readUser } from '@/lib/auth';
import { balanceMethod, isBalanceMethod } from '@/lib/data/balance';
import { messageFor } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';
import { canStartReturn, getOrderReturns, returnWindows } from '@/lib/data/returns';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Report missing items · Store' };

const FIELD_ERROR: Record<string, string> = {
  items: 'Choose at least one missing item, up to the quantity that’s left in the order.',
  resolution: 'Choose a refund or a replacement.',
  comment: 'Keep the comment under 1,000 characters.',
  refundTo: 'Choose where the refund goes: back to how you paid, or your balance.',
};

/**
 * /orders/:id/missing: "Item missing from package". Pick the items that weren't in the box and
 * how many, then get them refunded at once or sent again; there's nothing to send back.
 */
export default async function MissingItemsPage({
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
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(`${page}/missing`)}`));
  const client = await db();
  const [order, returns] = await Promise.all([getOrder(client, id), getOrderReturns(client, id)]);
  if (!order || !returns) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `${page}/missing`));

  const now = new Date();
  const money = (minor: number) => formatMoney(minor, order.currency);
  const open = canStartReturn(returns, now);
  const windows = returnWindows(returns, now);
  const perItem = !!windows && longDate(windows.first, store) !== longDate(windows.last, store);
  const lines = order.items.filter((it) => (returns.returnable[it.productId] ?? 0) > 0);
  const replaceable = lines.filter((it) => (returns.replaceable[it.productId] ?? 0) > 0);
  // in a category that's replaced rather than refunded, while it can be
  const replaceOnly = lines.filter((it) => it.replacementOnly);
  const names = (items: typeof lines) => items.map((it) => it.title).join(', ');
  const replaceFirst = replaceOnly.length === lines.length && replaceable.length === lines.length;
  const original = refundTo(order.paymentMethod, order.paymentLabel);
  // an order paid from the balance is refunded to it anyway, and a Pay Later one only to Pay Later
  const balance = isBalanceMethod(order.paymentMethod) || order.paymentMethod === 'paylater' ? null : refundTo(balanceMethod(order.market), '');
  const errorText = error
    ? (error === 'invalid_input' && field && FIELD_ERROR[field]) ||
      (error === 'return_not_allowed' && field === 'replacement_only'
        ? `${replaceOnly.length ? names(replaceOnly) : 'That item'} can only be replaced: choose a replacement. We refund it only when it can’t be replaced.`
        : null) ||
      messageFor(error) ||
      'Something went wrong. Please try again.'
    : null;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-[clamp(16px,3vw,24px)] pb-[120px] pt-8">
        <nav aria-label="Breadcrumb" className="text-[14px] text-ink-2">
          <a href={sp('/orders')} className="text-ink-2 underline underline-offset-2 hover:text-ink">Your orders</a>
          <span aria-hidden> › </span>
          <a href={sp(page)} className="font-mono text-ink-2 underline underline-offset-2 hover:text-ink">{order.id}</a>
          <span aria-hidden> › </span>
          <span className="text-ink">Missing items</span>
        </nav>
        <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Report missing items</h1>

        {!open ? (
          <>
            <Alert tone="info">
              {!returns.delivered
                ? 'You can report missing items once your order has been delivered.'
                : returns.returnBy && Date.parse(returns.returnBy) < now.getTime()
                  ? `Missing items had to be reported by ${longDate(new Date(returns.returnBy), store)}. Contact customer service if something’s still missing.`
                  : 'There’s nothing left in this order to report missing: every item has been returned, replaced or reported already.'}
            </Alert>
            <a href={sp(page)} className={`${buttonClasses({ variant: 'secondary' })} self-start`}>Back to the order</a>
          </>
        ) : (
          <form action={reportItemsMissing.bind(null, order.id)} className="flex flex-col gap-5">
            <p className="m-0 text-[15px] text-ink-2">
              Sorry something wasn’t in the box. Before you report it, check all the packaging, padding included: small items can hide in it. You can report it{' '}
              {windows ? returnUntilText(windows, store) : `until ${longDate(new Date(returns.returnBy!), store)}`}, and there’s nothing to send back.
            </p>
            {errorText ? <Alert tone="error">{errorText}</Alert> : null}

            <fieldset className="m-0 flex flex-col overflow-hidden rounded-panel border border-line bg-surface p-0">
              <legend className="sr-only">Missing items</legend>
              <h2 className="m-0 px-[18px] pb-1 pt-4 text-[16px] font-semibold">What was missing?</h2>
              {lines.map((it) => {
                const left = returns.returnable[it.productId];
                const by = perItem && returns.returnByItem[it.productId] ? new Date(returns.returnByItem[it.productId]) : null;
                const fieldId = `qty-${it.productId}`;
                return (
                  <div key={it.productId} className="flex flex-wrap items-center gap-3.5 border-t border-line-2 px-[18px] py-3.5 first-of-type:border-t-0">
                    <span className="w-14 flex-none" aria-hidden>
                      <ProductFrame src={it.image} alt="" aspect="1/1" />
                    </span>
                    <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                      <label htmlFor={fieldId} className="line-clamp-2 text-[15px] font-semibold">{it.title}</label>
                      {it.size ? <span className="text-[13px] text-ink-2">Size: {it.size}</span> : null}
                      <span className="text-[13px] text-ink-3">
                        {money(it.unitPriceMinor - (it.unitDiscountMinor ?? 0))} each{it.unitDiscountMinor ? ' after coupon' : ''} · {left === it.qty ? `${it.qty} ordered` : `${left} of ${it.qty} left`}{by ? ` · report by ${shortDate(by, store)}` : ''}{it.replacementOnly ? ' · Replacement only' : ''}
                      </span>
                    </div>
                    <select id={fieldId} name={`qty:${it.productId}`} defaultValue={lines.length === 1 && left === 1 ? '1' : '0'} className={selectClass}>
                      {Array.from({ length: left + 1 }, (_, n) => (
                        <option key={n} value={n}>{n === 0 ? 'Not missing' : `${n} missing`}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </fieldset>
            {replaceOnly.length ? (
              <p className="m-0 -mt-2 text-[13px] text-ink-3">
                Replacement only: {names(replaceOnly)}. We send {replaceOnly.length === 1 ? 'it' : 'them'} again; if we can’t (replaced once already, or out of stock), we refund {replaceOnly.length === 1 ? 'it' : 'them'}.
              </p>
            ) : null}

            {replaceable.length ? (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1.5 p-0 text-[14px] font-semibold">What would you like?</legend>
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input type="radio" name="resolution" value="refund" defaultChecked={!replaceFirst} className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>
                    <span className="font-semibold">A refund</span>
                    <span className="block text-[13px] text-ink-3">For the items, with their share of tax and delivery, right away{balance ? ', to where you choose below' : ` to ${original}`}.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input type="radio" name="resolution" value="replacement" defaultChecked={replaceFirst} className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>
                    <span className="font-semibold">Send them again</span>
                    <span className="block text-[13px] text-ink-3">
                      The same items at no charge, sent right away{replaceable.length < lines.length ? `; available for ${names(replaceable)}` : ''}.
                    </span>
                  </span>
                </label>
              </fieldset>
            ) : (
              <p className="m-0 text-[14px] text-ink-2">We’ll refund the items, with their share of tax and delivery, right away{balance ? ', to where you choose below' : ` to ${original}`}.</p>
            )}

            {balance ? (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1.5 p-0 text-[14px] font-semibold">Where should a refund go?</legend>
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input type="radio" name="refundTo" value="original" defaultChecked className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>
                    <span className="font-semibold">Back to how you paid</span>
                    <span className="block text-[13px] text-ink-3">To {original}.{order.paymentMethod === 'card' ? ' Card refunds take 5–10 business days to show up.' : ''}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input type="radio" name="refundTo" value="balance" className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>
                    <span className="font-semibold">To {balance}</span>
                    <span className="block text-[13px] text-ink-3">Added right away, ready to spend on anything in the store. It can’t be moved back to {original}.</span>
                  </span>
                </label>
              </fieldset>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="missing-comment" className="text-[14px] font-semibold">Anything else? <span className="font-normal text-ink-3">(optional)</span></label>
              <textarea id="missing-comment" name="comment" maxLength={1000} rows={3} className={`${fieldClass} h-auto py-2.5 leading-normal`} placeholder="What was in the box, or anything we should know" />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button type="submit" className={buttonClasses({ variant: 'primary', size: 'lg' })}>Report missing items</button>
              <a href={sp(page)} className={buttonClasses({ variant: 'link' })}>Cancel</a>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
