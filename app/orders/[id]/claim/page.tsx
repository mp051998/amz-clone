import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProductFrame } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass, selectClass } from '@/components/lib/controls';
import { longDate } from '@/components/orders/format';
import { refundTo } from '@/components/orders/Returns';
import { fileMyClaim } from '@/app/actions/claims';
import { CLAIM_DETAILS_MAX, CLAIM_NOT_ALLOWED, CLAIM_REASON_LABEL, CLAIM_REASONS, claimableSellers, claimOpenUntil, soldByStore } from '@/lib/atoz';
import { readUser } from '@/lib/auth';
import { orderClaims } from '@/lib/data/atoz-claims';
import { messageFor } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'File an A-to-z Guarantee claim · Store' };

const FIELD_ERROR: Record<string, string> = {
  seller: 'Choose the seller the claim is about.',
  reason: 'Choose what went wrong.',
  details: 'Tell us what happened: at least 10 characters, up to 2,000.',
};

/** /orders/:id/claim: file an A-to-z Guarantee claim about one seller's items in the order. */
export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; detail?: string; seller?: string }>;
}) {
  const { id } = await params;
  const { error, detail, seller: chosen } = await searchParams;
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const page = `/orders/${encodeURIComponent(id)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(`${page}/claim`)}`));
  const client = await db();
  const order = await getOrder(client, id);
  if (!order) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `${page}/claim`));

  const now = new Date();
  const money = (minor: number) => formatMoney(minor, order.currency);
  const claims = order.status === 'placed' ? await orderClaims(client, order.id) : [];
  const openUntil = claimOpenUntil(order, now);
  const sellers = claimableSellers(order, claims, now);
  const contactHref = (seller: string) => sp(`/customer-service/contact?${new URLSearchParams({ seller, order: order.id })}`);
  const errorSeller = chosen && sellers.includes(chosen) ? chosen : sellers[0];
  const errorText = error
    ? (error === 'invalid_input' && detail && FIELD_ERROR[detail]) ||
      (error === 'claim_not_allowed' && detail && CLAIM_NOT_ALLOWED[detail]) ||
      messageFor(error) ||
      'Something went wrong. Please try again.'
    : null;
  const askSeller = error === 'claim_not_allowed' && (detail === 'contact_seller_first' || detail === 'wait_for_seller') && errorSeller;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-[clamp(16px,3vw,24px)] pb-[120px] pt-8">
        <nav aria-label="Breadcrumb" className="text-[14px] text-ink-2">
          <a href={sp('/orders')} className="text-ink-2 underline underline-offset-2 hover:text-ink">Your orders</a>
          <span aria-hidden> › </span>
          <a href={sp(page)} className="font-mono text-ink-2 underline underline-offset-2 hover:text-ink">{order.id}</a>
          <span aria-hidden> › </span>
          <span className="text-ink">A-to-z Guarantee claim</span>
        </nav>
        <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">File an A-to-z Guarantee claim</h1>

        {!openUntil || !sellers.length ? (
          <>
            <Alert tone="info">
              {!openUntil
                ? order.status === 'placed' && order.deliveredAt && Date.parse(order.deliveredAt) <= now.getTime()
                  ? CLAIM_NOT_ALLOWED.window_closed
                  : CLAIM_NOT_ALLOWED.not_delivered
                : order.items.every((i) => soldByStore(i.seller))
                  ? CLAIM_NOT_ALLOWED.sold_by_amazon
                  : 'You’ve already filed a claim about every seller in this order.'}
            </Alert>
            <a href={sp(page)} className={`${buttonClasses({ variant: 'secondary' })} self-start`}>Back to the order</a>
          </>
        ) : (
          <form action={fileMyClaim.bind(null, order.id)} className="flex flex-col gap-5">
            <p className="m-0 text-[15px] text-ink-2">
              When something you bought from another seller didn’t arrive or isn’t what was described, and the seller hasn’t put it right, we step in.
              Contact the seller first and give them 2 days to help. If we grant the claim, we refund what’s left of their items in this order to{' '}
              {refundTo(order.paymentMethod, order.paymentLabel)}, with nothing to send back. You can file it until {longDate(openUntil, store)}.
            </p>
            {errorText ? (
              <Alert tone="error">
                {errorText}
                {askSeller ? (
                  <>
                    {' '}
                    <a href={contactHref(askSeller)} className="text-ink underline underline-offset-2">Contact {askSeller}</a>
                  </>
                ) : null}
              </Alert>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="claim-seller" className="text-[14px] font-semibold">Which seller is it about?</label>
              <select id="claim-seller" name="seller" required defaultValue={errorSeller} className={`${selectClass} w-full`}>
                {sellers.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <section className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface" aria-label="Items in this order">
              {order.items
                .filter((it) => sellers.includes(it.seller))
                .map((it) => (
                  <div key={it.productId} className="flex items-center gap-3.5 border-t border-line-2 px-[18px] py-3 first-of-type:border-t-0">
                    <span className="w-12 flex-none" aria-hidden>
                      <ProductFrame src={it.image} alt="" aspect="1/1" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="line-clamp-2 text-[14px] font-semibold">{it.title}</span>
                      <span className="text-[13px] text-ink-3">
                        Qty {it.qty} · {money(it.unitPriceMinor * it.qty)} · Sold by {it.seller} ·{' '}
                        <a href={contactHref(it.seller)} className="text-ink-3 underline underline-offset-2">Contact seller</a>
                      </span>
                    </div>
                  </div>
                ))}
            </section>

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1.5 p-0 text-[14px] font-semibold">What went wrong?</legend>
              {CLAIM_REASONS.map((r, n) => (
                <label key={r} className="flex items-start gap-2.5 text-[14px]">
                  <input type="radio" name="reason" value={r} required defaultChecked={n === 0} className="mt-0.5 size-4 flex-none accent-ink" />
                  <span>{CLAIM_REASON_LABEL[r]}</span>
                </label>
              ))}
              {order.paymentMethod === 'cod' ? (
                <span className="text-[13px] text-ink-3">You paid on delivery, so a package that didn’t arrive wasn’t charged.</span>
              ) : null}
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="claim-details" className="text-[14px] font-semibold">What happened?</label>
              <textarea
                id="claim-details"
                name="details"
                required
                minLength={10}
                maxLength={CLAIM_DETAILS_MAX}
                rows={5}
                className={`${fieldClass} h-auto py-2.5 leading-normal`}
                placeholder="What’s wrong, and what the seller said when you contacted them"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <SubmitButton variant="primary" size="lg">File claim</SubmitButton>
              <a href={sp(page)} className={buttonClasses({ variant: 'link' })}>Cancel</a>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
