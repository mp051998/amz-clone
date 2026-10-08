import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProductFrame } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass, selectClass } from '@/components/lib/controls';
import { longDate, returnUntilText, shortDate } from '@/components/orders/format';
import { REASON_LABEL, refundTo } from '@/components/orders/Returns';
import { ReturnMethodFields } from '@/components/orders/ReturnMethod';
import { startReturn } from '@/app/actions/returns';
import { readUser } from '@/lib/auth';
import { balanceMethod, isBalanceMethod } from '@/lib/data/balance';
import { getProducts } from '@/lib/data/catalog';
import { messageFor } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';
import { listPickupPoints } from '@/lib/data/pickup';
import { isReturnable } from '@/lib/data/return-policy';
import { canStartReturn, getOrderReturns, RETURN_REASONS, returnPickupDays, returnWindows } from '@/lib/data/returns';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Return items · Store' };

const FIELD_ERROR: Record<string, string> = {
  items: 'Choose at least one item to return, up to the quantity that’s left.',
  reason: 'Choose why you’re returning it.',
  comment: 'Keep the comment under 1,000 characters.',
  resolution:
    'Replacements are for items that arrived damaged, don’t work, are wrong, have parts missing or aren’t as described, and exchanges for a size that’s too small or too large. Choose one of those reasons, or a refund.',
  size: 'For an exchange, pick the size you’d like instead of the one you have, for each item you’re returning.',
  refundTo: 'Choose where the refund goes: back to how you paid, or your balance.',
};

const FAULTS = 'arrived damaged, doesn’t work, is the wrong item, has parts missing or isn’t as described';

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
  const [order, returns, points] = await Promise.all([getOrder(client, id), getOrderReturns(client, id), listPickupPoints(client, store.id)]);
  if (!order || !returns) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `${page}/return`));

  const now = new Date();
  const money = (minor: number) => formatMoney(minor, order.currency);
  const open = canStartReturn(returns, now);
  const windows = returnWindows(returns, now);
  // a replacement's own window can end later than the rest of the order's: say each item's then
  const perItem = !!windows && longDate(windows.first, store) !== longDate(windows.last, store);
  const lines = order.items.filter((it) => (returns.returnable[it.productId] ?? 0) > 0);
  const replaceable = lines.filter((it) => (returns.replaceable[it.productId] ?? 0) > 0);
  // an item that comes in sizes can be exchanged for another of them, while it can be replaced
  const sized = replaceable.filter((it) => it.size);
  const sizesOf = new Map((sized.length ? await getProducts(client, sized.map((it) => it.productId), { includeArchived: true }) : []).map((p) => [p.id, p.sizes ?? []]));
  const otherSizes = (it: (typeof lines)[number]) => (sizesOf.get(it.productId) ?? []).filter((s) => s !== it.size);
  const exchangeable = sized.filter((it) => otherSizes(it).length > 0);
  // in a category that can't be returned in this store
  const keep = order.items.filter((it) => !isReturnable(it));
  // in a category that only goes back for a fault, as a replacement (a refund when it can't be)
  const replaceOnly = lines.filter((it) => it.replacementOnly);
  const names = (items: typeof lines) => items.map((it) => it.title).join(', ');
  // when everything left to return is replacement only and can be replaced, that's the choice
  const replaceFirst = replaceOnly.length === lines.length && replaceable.length === lines.length;
  const original = refundTo(order.paymentMethod, order.paymentLabel);
  // an order paid from the balance is refunded to it anyway, and a Pay Later one only to Pay Later
  const balance = isBalanceMethod(order.paymentMethod) || order.paymentMethod === 'paylater' ? null : refundTo(balanceMethod(order.market), '');
  // a courier collects from the delivery address, which an order collected from a pickup point doesn't have
  const collectFrom = order.pickup ? undefined : [order.shipTo.line1, order.shipTo.line2, `${order.shipTo.city} ${order.shipTo.postcode}`].filter(Boolean).join(', ');
  const errorText = error
    ? (error === 'invalid_input' && field && FIELD_ERROR[field]) ||
      (error === 'return_not_allowed' && field === 'replacement_only'
        ? `${replaceOnly.length ? names(replaceOnly) : 'That item'} can only be replaced, if it ${FAULTS}. Choose one of those reasons and a replacement; we refund it only when it can’t be replaced.`
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
          <span className="text-ink">Return</span>
        </nav>
        <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Return items</h1>

        {!open ? (
          <>
            <Alert tone="info">
              {!returns.delivered
                ? 'You can return items once they’ve been delivered.'
                : keep.length === order.items.length
                  ? `${order.items.length === 1 ? 'This item' : 'The items in this order'} can’t be returned.`
                  : returns.returnBy && Date.parse(returns.returnBy) < now.getTime()
                    ? `The return window for this order closed on ${longDate(new Date(returns.returnBy), store)}.`
                    : 'Every item in this order is already being returned.'}
            </Alert>
            <a href={sp(page)} className={`${buttonClasses({ variant: 'secondary' })} self-start`}>Back to the order</a>
          </>
        ) : (
          <form action={startReturn.bind(null, order.id)} className="flex flex-col gap-5">
            <p className="m-0 text-[15px] text-ink-2">
              Eligible {windows ? returnUntilText(windows, store) : `until ${longDate(new Date(returns.returnBy!), store)}`}. Refunds go to {original}{balance ? `, or ${balance} if you’d rather,` : ''} once the items reach us.
            </p>
            {errorText ? <Alert tone="error">{errorText}</Alert> : null}

            <fieldset className="m-0 flex flex-col overflow-hidden rounded-panel border border-line bg-surface p-0">
              <legend className="sr-only">Items to return</legend>
              <h2 className="m-0 px-[18px] pb-1 pt-4 text-[16px] font-semibold">What are you returning?</h2>
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
                        {money(it.unitPriceMinor - (it.unitDiscountMinor ?? 0))} each{it.unitDiscountMinor ? ' after coupon' : ''} · {left === it.qty ? `${it.qty} ordered` : `${left} of ${it.qty} left to return`}{by ? ` · return by ${shortDate(by, store)}` : ''}{it.replacementOnly ? ' · Replacement only' : ''}
                      </span>
                    </div>
                    <select id={fieldId} name={`qty:${it.productId}`} defaultValue={lines.length === 1 ? String(left) : '0'} className={selectClass}>
                      {Array.from({ length: left + 1 }, (_, n) => (
                        <option key={n} value={n}>{n === 0 ? 'Not returning' : `Return ${n}`}</option>
                      ))}
                    </select>
                    {exchangeable.includes(it) ? (
                      <div className="flex basis-full items-center gap-2.5 pl-[70px] text-[13px] max-sm:pl-0">
                        <label htmlFor={`size-${it.productId}`} className="text-ink-2">For an exchange, send size</label>
                        <select id={`size-${it.productId}`} name={`size:${it.productId}`} defaultValue="" className={selectClass}>
                          <option value="">Choose a size</option>
                          {otherSizes(it).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
            {keep.length ? (
              <p className="m-0 -mt-2 text-[13px] text-ink-3">Can’t be returned: {keep.map((it) => it.title).join(', ')}.</p>
            ) : null}
            {replaceOnly.length ? (
              <p className="m-0 -mt-2 text-[13px] text-ink-3">
                Replacement only: {names(replaceOnly)}. {replaceOnly.length === 1 ? 'It' : 'Each'} can go back only if it {FAULTS}, and we send another; if we can’t (it’s been replaced once already, or it’s out of stock), we refund it.
              </p>
            ) : null}

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
                  <input type="radio" name="resolution" value="refund" defaultChecked={!replaceFirst} className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>
                    <span className="font-semibold">A refund</span>
                    <span className="block text-[13px] text-ink-3">{balance ? 'Once the items reach us, to where you choose below.' : `To ${original}, once the items reach us.`}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input type="radio" name="resolution" value="replacement" defaultChecked={replaceFirst} className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>
                    <span className="font-semibold">A replacement</span>
                    <span className="block text-[13px] text-ink-3">
                      The same item again at no charge, sent right away. Only if it arrived damaged, doesn’t work, is the wrong item, has parts missing or isn’t as described
                      {replaceable.length < lines.length ? `; available for ${replaceable.map((it) => it.title).join(', ')}` : ''}.
                    </span>
                  </span>
                </label>
                {exchangeable.length ? (
                  <label className="flex items-start gap-2.5 text-[14px]">
                    <input type="radio" name="resolution" value="exchange" className="mt-0.5 size-4 flex-none accent-ink" />
                    <span>
                      <span className="font-semibold">An exchange for a different size</span>
                      <span className="block text-[13px] text-ink-3">
                        The same item in the size you pick above, sent right away at no charge, if it’s too small or too large
                        {exchangeable.length < lines.length ? `; available for ${exchangeable.map((it) => it.title).join(', ')}` : ''}.
                      </span>
                    </span>
                  </label>
                ) : null}
              </fieldset>
            ) : null}

            {balance ? (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1.5 p-0 text-[14px] font-semibold">Where should the refund go?</legend>
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input type="radio" name="refundTo" value="original" defaultChecked className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>
                    <span className="font-semibold">Back to how you paid</span>
                    <span className="block text-[13px] text-ink-3">
                      To {original}, once the items reach us.{order.paymentMethod === 'card' ? ' Card refunds take 5–10 business days to show up.' : ''}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input type="radio" name="refundTo" value="balance" className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>
                    <span className="font-semibold">To {balance}</span>
                    <span className="block text-[13px] text-ink-3">Added the moment the items reach us, ready to spend on anything in the store. It can’t be moved back to {original}.</span>
                  </span>
                </label>
              </fieldset>
            ) : null}

            <ReturnMethodFields
              idPrefix="return"
              legend="How will you send it back?"
              points={points}
              days={returnPickupDays(store.dates.timeZone, now)}
              pickupFrom={collectFrom}
              store={store}
              now={now}
            />

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
