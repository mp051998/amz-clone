import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { AddressStep } from '@/components/checkout/AddressStep';
import { DeliverySpeed } from '@/components/checkout/DeliverySpeed';
import { GiftOption } from '@/components/checkout/GiftOption';
import { PaymentSection } from '@/components/checkout/PaymentSection';
import { PlaceOrderButton } from '@/components/checkout/PlaceOrderButton';
import { StepCard } from '@/components/checkout/StepCard';
import { arrivingText, byTimeText, lcFirst, relativeDayName } from '@/components/orders/format';
import { submitCheckout } from '@/app/actions/order';
import { stripeConfigured } from '@/lib/stripe';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { listAddresses } from '@/lib/data/addresses';
import { fastShipFee, GIFT_NOTE_MAX } from '@/lib/data/orders';
import { plusMembership } from '@/lib/data/plus';
import { deliveryOptions } from '@/lib/decision/tracking';
import { messageFor } from '@/lib/data/errors';
import { viewerCart } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';

export const metadata: Metadata = { title: 'Checkout · Store' };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; msg?: string; canceled?: string }>;
}) {
  const { error, msg, canceled } = await searchParams;
  const store = await getMarketplace();
  const cur = store.currency.code;
  const money = (minor: number) => formatMoney(minor, cur);
  const sp = (path: string) => storePath(store, path);
  const isIN = store.id === 'IN';
  // checkout requires a signed-in account (orders are stored per signed-in user); the guest cart is
  // merged into the account on sign-in.
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/checkout'));
  const client = await db();
  const [cart, addresses, fastFee, plus] = await Promise.all([
    viewerCart(),
    listAddresses(client, store.id),
    fastShipFee(client, store.id),
    plusMembership(client),
  ]);
  const { lines, count, totals } = cart;
  const prefillName = (addresses.find((a) => a.isDefault) ?? addresses[0])?.name ?? user.name ?? '';

  const shell = (children: ReactNode) => (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Checkout</h1>
          <a href={sp('/cart')} className="text-[14px] text-ink underline underline-offset-2">← Back to cart</a>
        </div>
        {children}
      </div>
    </AppShell>
  );

  if (lines.length === 0) {
    return shell(
      <EmptyState title="Your cart is empty" action={<a href={sp('/s')} className={buttonClasses({ variant: 'dark' })}>Find something</a>}>
        Add items to your cart before checking out.
      </EmptyState>,
    );
  }

  // invalid_input carries the specific field message from validation
  const problem = error ? (error === 'invalid_input' && msg ? msg : messageFor(error) ?? 'Something went wrong. Please try again.') : null;
  const blocked = lines.some((l) => !l.inStock);
  const unavailable = lines.some((l) => !l.available);
  const now = new Date();
  const options = deliveryOptions(now, store.dates.timeZone);
  const eta = new Date(options.standard);
  // faster delivery is offered only while it beats standard (and once the store has a fee for it);
  // Plus members get it free, as place_order charges them
  const fast = options.fast && fastFee !== null ? { eta: new Date(options.fast), feeMinor: plus ? 0 : fastFee } : null;
  const fastFeeText = fast ? (fast.feeMinor === 0 ? 'FREE' : money(fast.feeMinor)) : '';
  const fastWhen = fast ? byTimeText(fast.eta, store, now) : '';
  const shipText = totals.shipMinor === 0 ? 'FREE' : money(totals.shipMinor);
  const freeOver = totals.shipMinor === 0 ? '' : ` · FREE over ${money(cart.freeShipThresholdMinor)}`;
  // the summary follows the chosen speed with CSS alone (the fast radio is #ship-fast)
  const bySpeed = (standard: ReactNode, faster: ReactNode) =>
    fast ? (
      <>
        <span className="group-has-[#ship-fast:checked]/co:hidden">{standard}</span>
        <span className="hidden group-has-[#ship-fast:checked]/co:inline">{faster}</span>
      </>
    ) : standard;
  const methods = store.payments.map((pm) => pm.method).filter((m) => m !== 'card' || stripeConfigured);

  return shell(
    <>
      {problem ? (
        <Alert tone="error">{problem}</Alert>
      ) : canceled ? (
        <Alert tone="info">Payment canceled — you have not been charged. Your cart is unchanged.</Alert>
      ) : null}
      {blocked ? (
        <Alert tone="warning">
          {unavailable ? 'Some items are no longer available.' : 'Some items no longer have enough stock.'}{' '}
          <a href={sp('/cart')} className="underline">Update your cart</a> to place the order.
        </Alert>
      ) : null}

      <form action={submitCheckout} className="group/co flex flex-wrap items-start gap-6">
        <input type="hidden" name="schema" value={store.address.schema} />
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
          <AddressStep addresses={addresses} isIN={isIN} defaultName={prefillName} manageHref={sp('/account/addresses')} />
          <PaymentSection methods={methods} curSymbol={store.currency.symbol} defaultName={prefillName} stripeCard={stripeConfigured} />
          <StepCard
            n={3}
            title="Delivery"
            value={bySpeed(arrivingText(eta, store, now), `Arriving ${lcFirst(fastWhen)}`)}
            sub={fast ? undefined : totals.shipMinor === 0 ? (plus ? 'FREE delivery with Plus' : 'FREE delivery') : `Delivery ${money(totals.shipMinor)}${freeOver}`}
          >
            {fast ? (
              <DeliverySpeed
                standard={{ label: 'Standard delivery', sub: `${arrivingText(eta, store, now)} · ${shipText}${freeOver}` }}
                fast={{
                  label: relativeDayName(fast.eta, store, now) === 'Today' ? 'Same-Day delivery' : 'One-Day delivery',
                  sub: `Arriving ${lcFirst(fastWhen)} · ${fastFeeText}`,
                }}
              />
            ) : null}
            <GiftOption max={GIFT_NOTE_MAX} />
          </StepCard>
          <section className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-[18px]" aria-labelledby="co-items-h">
            <h2 id="co-items-h" className="m-0 text-[13px] font-normal text-ink-3">Items ({count})</h2>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {lines.map((l) => (
                <li key={l.product.id} className="flex justify-between gap-3 text-[15px]">
                  <span className="min-w-0">
                    {l.product.title}
                    <span className="text-ink-3"> × {l.qty}</span>
                    {!l.available ? (
                      <span className="block text-[13px] font-semibold text-warn">⚠ No longer available</span>
                    ) : !l.inStock ? (
                      <span className="block text-[13px] font-semibold text-warn">⚠ Not enough stock</span>
                    ) : null}
                  </span>
                  <span className="flex-none font-semibold tabular-nums">{money(l.lineTotalMinor)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex flex-[1_1_300px] flex-col gap-2.5 rounded-card border border-line bg-surface p-[18px] md:sticky md:top-[128px]" aria-labelledby="summary-h">
          <h2 id="summary-h" className="m-0 mb-1 text-[18px] font-semibold">Order summary</h2>
          <dl className="m-0 flex flex-col gap-2.5 text-[15px]">
            <div className="flex justify-between gap-3"><dt>Items</dt><dd className="m-0 tabular-nums">{money(totals.subtotalMinor)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Delivery</dt><dd className="m-0 tabular-nums">{bySpeed(shipText, fastFeeText)}</dd></div>
            {store.pricing.taxInclusive ? (
              <div className="flex justify-between gap-3 text-ink-3"><dt>Tax</dt><dd className="m-0">{store.pricing.taxNote ?? 'Inclusive of all taxes'}</dd></div>
            ) : (
              <div className="flex justify-between gap-3"><dt>Estimated tax</dt><dd className="m-0 tabular-nums">{money(totals.taxMinor)}</dd></div>
            )}
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <dt className="text-[18px] font-semibold">Total</dt>
              <dd className="m-0 text-[26px] font-bold tracking-[-0.01em] tabular-nums">{bySpeed(money(totals.totalMinor), fast ? money(totals.subtotalMinor + fast.feeMinor + totals.taxMinor) : null)}</dd>
            </div>
          </dl>
          {blocked ? (
            <a href={sp('/cart')} className={buttonClasses({ variant: 'secondary', size: 'lg', block: true })}>Update your cart</a>
          ) : (
            <PlaceOrderButton />
          )}
          <span className="text-[13px] leading-[1.4] text-ink-2">
            {stripeConfigured
              ? `By placing your order you agree to this demo’s terms. Cards are paid on Stripe in ${cur} (test card 4242 4242 4242 4242); other methods are demo only.`
              : 'By placing your order you agree to this demo’s terms. No real charge is made.'}
          </span>
        </aside>
      </form>
    </>,
  );
}
