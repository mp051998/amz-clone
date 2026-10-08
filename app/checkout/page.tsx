import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { AddressStep } from '@/components/checkout/AddressStep';
import { BuyNowQty } from '@/components/checkout/BuyNowQty';
import { DeliverySpeed } from '@/components/checkout/DeliverySpeed';
import { GiftOption } from '@/components/checkout/GiftOption';
import { GstOption } from '@/components/checkout/GstOption';
import { GST_NAME_MAX } from '@/lib/gst';
import { PaymentSection } from '@/components/checkout/PaymentSection';
import { PlaceOrderButton } from '@/components/checkout/PlaceOrderButton';
import { StepCard } from '@/components/checkout/StepCard';
import { arrivingText, byTimeText, lcFirst, relativeDayName, releaseDate } from '@/components/orders/format';
import { latestRelease } from '@/lib/pre-order';
import { submitCheckout } from '@/app/actions/order';
import { stripeConfigured } from '@/lib/stripe';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { listAddresses } from '@/lib/data/addresses';
import { fastShipFee, giftWrapFee, GIFT_NOTE_MAX } from '@/lib/data/orders';
import { plusMembership } from '@/lib/data/plus';
import { listPickupPoints } from '@/lib/data/pickup';
import { weekdayName } from '@/lib/delivery-day';
import { isBalanceMethod, storeBalance } from '@/lib/data/balance';
import { deliveryOptions } from '@/lib/decision/tracking';
import { DataError, messageFor } from '@/lib/data/errors';
import { buyNowQuote } from '@/lib/data/cart';
import { buyNowQuery, readBuyNow, type BuyNow } from '@/lib/buy-now';
import type { Cart } from '@/lib/types';
import { viewerCart } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { protectionPlanName } from '@/lib/protection';
import { EMI_MIN_MINOR, emiPlans } from '@/lib/emi';
import { PromoCode } from '@/components/checkout/PromoCode';
import { checkoutQuote, type CheckoutQuote } from '@/lib/data/promo';
import { promoProblem, readPromoCode } from '@/lib/promo';
import { purchaseAllowance } from '@/lib/data/purchase-limits';
import { limitNote, unitsLeft } from '@/lib/purchase-limits';

export const metadata: Metadata = { title: 'Checkout · Store' };

/** The checkout priced with a promotion code; null when Buy Now's product isn't sold here (any more). */
async function promoQuote(client: Awaited<ReturnType<typeof db>>, market: Cart['market'], code: string, buy: BuyNow | null): Promise<CheckoutQuote | null> {
  try {
    return await checkoutQuote(client, market, code, buy ?? undefined);
  } catch (err) {
    if (err instanceof DataError) return null;
    throw err;
  }
}

/** Buy Now's one line, priced; null when the product isn't sold here (any more). */
async function quote(client: Awaited<ReturnType<typeof db>>, market: Cart['market'], buy: BuyNow): Promise<Cart | null> {
  try {
    return await buyNowQuote(client, market, buy.productId, buy.qty, buy.protection, buy.size);
  } catch (err) {
    if (err instanceof DataError) return null;
    throw err;
  }
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; msg?: string; detail?: string; canceled?: string; buy?: string; qty?: string; protection?: string; size?: string; promo?: string }>;
}) {
  const { error, msg, detail, canceled, buy: buyId, qty: buyQty, protection, size, promo: promoParam } = await searchParams;
  const promoCode = readPromoCode(promoParam);
  // Buy Now: checkout for just this product; the cart is left as it is
  const buy = readBuyNow(buyId, buyQty, protection, size);
  const store = await getMarketplace();
  const cur = store.currency.code;
  const money = (minor: number) => formatMoney(minor, cur);
  const sp = (path: string) => storePath(store, path);
  const isIN = store.id === 'IN';
  // checkout requires a signed-in account (orders are stored per signed-in user); the guest cart is
  // merged into the account on sign-in.
  const user = await readUser();
  if (!user) redirect(sp(`/signin?next=${encodeURIComponent(buy ? `/checkout?${buyNowQuery(buy)}` : '/checkout')}`));
  const client = await db();
  const [priced, addresses, fastFee, wrapFee, plus, balanceMinor, points] = await Promise.all([
    promoCode ? promoQuote(client, store.id, promoCode, buy) : (buy ? quote(client, store.id, buy) : viewerCart()).then((c): CheckoutQuote | null => (c ? { cart: c } : null)),
    listAddresses(client, store.id),
    fastShipFee(client, store.id),
    giftWrapFee(client, store.id),
    plusMembership(client),
    storeBalance(client, store.id),
    listPickupPoints(client, store.id),
  ]);
  const productHref = buy ? sp(`/product/${encodeURIComponent(buy.productId)}`) : null;
  const cart = priced?.cart ?? null;

  const shell = (children: ReactNode) => (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Checkout</h1>
          <a href={productHref ?? sp('/cart')} className="text-[14px] text-ink underline underline-offset-2">{productHref ? '← Back to the product' : '← Back to cart'}</a>
        </div>
        {children}
      </div>
    </AppShell>
  );

  if (!cart) {
    return shell(
      <EmptyState title="That product isn’t available" action={<a href={sp('/s')} className={buttonClasses({ variant: 'dark' })}>Find something</a>}>
        It isn’t sold in this store any more.
      </EmptyState>,
    );
  }
  // checkout covers the ticked lines; unticked ones stay in the cart (Buy Now's one line is ticked)
  const lines = cart.lines.filter((l) => l.selected);
  const { selectedCount: count, totals } = cart;
  const home = addresses.find((a) => a.isDefault) ?? addresses[0];
  const prefillName = home?.name ?? user.name ?? '';
  // pickup points in the shopper's city first, then the state's, then the rest
  const near = (p: { city: string; state: string }) =>
    home ? (p.city.toLowerCase() === home.city.toLowerCase() ? 0 : p.state.toLowerCase() === home.state.toLowerCase() ? 1 : 2) : 0;
  const pickupPoints = points.map((p, i) => ({ p, i })).sort((a, b) => near(a.p) - near(b.p) || a.i - b.i).map(({ p }) => p);

  if (cart.lines.length === 0) {
    return shell(
      <EmptyState title="Your cart is empty" action={<a href={sp('/s')} className={buttonClasses({ variant: 'dark' })}>Find something</a>}>
        Add items to your cart before checking out.
      </EmptyState>,
    );
  }
  if (lines.length === 0) {
    return shell(
      <EmptyState title="No items selected" action={<a href={sp('/cart')} className={buttonClasses({ variant: 'dark' })}>Back to cart</a>}>
        Tick the items in your cart that you want to check out.
      </EmptyState>,
    );
  }

  // invalid_input carries the specific field message from validation
  const problem = error
    ? error === 'invalid_input' && msg
      ? msg
      : promoProblem(error, detail, money, messageFor(error) ?? 'Something went wrong. Please try again.')
    : null;
  // the code in the summary, or the one that was tried and why it didn't apply
  const promo = cart.promo;
  const promoMinor = totals.promoMinor ?? 0;
  const promoTried = promoCode && priced?.promoError
    ? { code: promoCode, problem: promoProblem(priced.promoError.code, priced.promoError.detail, money, messageFor(priced.promoError.code) ?? 'That promotion code can’t be used here.') }
    : undefined;
  const limited = lines.filter((l) => l.product.maxPerCustomer).map((l) => l.product.id);
  const allowance = limited.length ? await purchaseAllowance(client, store.id, limited) : new Map();
  // a line past what's left of its limit per customer can't be ordered
  const leftOf = (l: (typeof lines)[number]) => unitsLeft(l.product, allowance);
  const overLimit = lines.filter((l) => l.available && (leftOf(l) ?? Infinity) < l.qty);
  const stockBlocked = lines.some((l) => !l.inStock);
  // a product that comes in sizes is ordered in one of them
  const sizeBlocked = lines.some((l) => l.available && l.needsSize);
  const blocked = stockBlocked || sizeBlocked || overLimit.length > 0;
  const unavailable = lines.some((l) => !l.available);
  const now = new Date();
  // Delivery Day: a Plus member's weekday, in a store that offers it; it costs what standard does
  const dayStore = store.features.deliveryDay === true;
  // a pre-order holds the order until it's released (orders_fill_schedule): no faster option then
  const release = latestRelease(lines.filter((l) => l.available).map((l) => l.product), now);
  const options = deliveryOptions(now, store.dates.timeZone, dayStore ? plus?.deliveryDay : null, release);
  const eta = new Date(options.standard);
  const onDay = options.day ? new Date(options.day) : null;
  // faster delivery is offered only while it beats standard (and once the store has a fee for it);
  // Plus members get it free, as place_order charges them
  const fast = options.fast && fastFee !== null ? { eta: new Date(options.fast), feeMinor: plus ? 0 : fastFee } : null;
  const fastFeeText = fast ? (fast.feeMinor === 0 ? 'FREE' : money(fast.feeMinor)) : '';
  const fastWhen = fast ? byTimeText(fast.eta, store, now) : '';
  const shipText = totals.shipMinor === 0 ? 'FREE' : money(totals.shipMinor);
  const discount = totals.discountMinor ?? 0;
  // coupons, quantity discounts and the promotion code are shown apart; the discount covers all three
  const qtyDiscountMinor = totals.qtyDiscountMinor ?? 0;
  const couponMinor = discount - (totals.promoMinor ?? 0) - qtyDiscountMinor;
  const freeOver = totals.shipMinor === 0 ? '' : ` · FREE over ${money(cart.freeShipThresholdMinor)}`;
  // the summary follows the chosen speed with CSS alone (the fast radio is #ship-fast); Delivery
  // Day (#ship-day) is priced like standard, so only the arrival changes
  const bySpeed = (standard: ReactNode, faster: ReactNode) =>
    fast ? (
      <>
        <span className="group-has-[#ship-fast:checked]/co:hidden">{standard}</span>
        <span className="hidden group-has-[#ship-fast:checked]/co:inline">{faster}</span>
      </>
    ) : standard;
  const byArrival = (standard: ReactNode, faster: ReactNode, day: ReactNode) =>
    onDay ? (
      <>
        <span className="group-has-[#ship-day:checked]/co:hidden">{bySpeed(standard, faster)}</span>
        <span className="hidden group-has-[#ship-day:checked]/co:inline">{day}</span>
      </>
    ) : bySpeed(standard, faster);
  // gift wrap is priced per unit; the summary follows its box (#gift-wrap) like the speed
  const wrapMinor = wrapFee === null ? 0 : wrapFee * lines.reduce((n, l) => n + l.qty, 0);
  const byWrap = (plain: ReactNode, wrapped: ReactNode) =>
    wrapMinor > 0 ? (
      <>
        <span className="group-has-[#gift-wrap:checked]/co:hidden">{plain}</span>
        <span className="hidden group-has-[#gift-wrap:checked]/co:inline">{wrapped}</span>
      </>
    ) : plain;
  const planMinor = totals.protectionMinor ?? 0;
  const fastTotal = fast ? totals.subtotalMinor - discount + fast.feeMinor + totals.taxMinor + planMinor : 0;
  // EMI from the store's minimum order (₹3,000), priced on the standard total
  const emi = emiPlans(store.id, totals.totalMinor).map((p) => ({
    months: p.months,
    text: `${money(p.monthlyMinor)} a month · ${p.noCost ? 'No Cost EMI' : `${money(p.interestMinor)} interest`}`,
  }));
  const methods = store.payments
    .map((pm) => pm.method)
    .filter((m) => (m !== 'card' || stripeConfigured) && (m !== 'emi' || totals.totalMinor >= EMI_MIN_MINOR));
  // balance methods pay the whole order from the gift card balance (null before balances exist)
  const balance = balanceMinor !== null && methods.some(isBalanceMethod)
    ? { text: money(balanceMinor), short: balanceMinor < totals.totalMinor, redeemHref: sp('/gift-cards#balance'), reloadHref: stripeConfigured ? sp('/gift-cards#reload') : undefined }
    : undefined;

  return shell(
    <>
      {problem ? (
        <Alert tone="error">{problem}</Alert>
      ) : canceled ? (
        <Alert tone="info">Payment canceled — you have not been charged. Your cart is unchanged.</Alert>
      ) : null}
      {blocked ? (
        productHref ? (
          <Alert tone="warning">
            {unavailable ? (
              <>
                This item is no longer available. <a href={productHref} className="underline">Back to the product</a> to pick again.
              </>
            ) : stockBlocked ? (
              'There isn’t enough stock for that many. Lower the quantity under Items to place the order.'
            ) : sizeBlocked ? (
              <>
                Select a size first. <a href={productHref} className="underline">Back to the product</a> to pick one.
              </>
            ) : leftOf(overLimit[0]) === 0 ? (
              'You’ve bought as many of this item as one customer can.'
            ) : (
              'That’s more than the limit per customer. Lower the quantity under Items to place the order.'
            )}
          </Alert>
        ) : (
          <Alert tone="warning">
            {unavailable
              ? 'Some items are no longer available.'
              : stockBlocked
                ? 'Some items no longer have enough stock.'
                : sizeBlocked
                  ? 'Some items need a size.'
                  : 'Some items are over their limit per customer.'}{' '}
            <a href={sp('/cart')} className="underline">Update your cart</a> to place the order.
          </Alert>
        )
      ) : null}

      <form action={submitCheckout} className="group/co flex flex-wrap items-start gap-6">
        <input type="hidden" name="schema" value={store.address.schema} />
        {buy ? (
          <>
            <input type="hidden" name="buy" value={buy.productId} />
            <input type="hidden" name="qty" value={buy.qty} />
            {buy.protection ? <input type="hidden" name="protection" value="1" /> : null}
            {buy.size ? <input type="hidden" name="size" value={buy.size} /> : null}
          </>
        ) : null}
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
          <AddressStep addresses={addresses} isIN={isIN} defaultName={prefillName} manageHref={sp('/account/addresses')} pickupPoints={pickupPoints} />
          <PaymentSection methods={methods} curSymbol={store.currency.symbol} defaultName={prefillName} stripeCard={stripeConfigured} balance={balance} emi={emi} />
          <StepCard
            n={3}
            title="Delivery"
            value={byArrival(arrivingText(eta, store, now), `Arriving ${lcFirst(fastWhen)}`, onDay ? arrivingText(onDay, store, now) : null)}
            sub={fast || onDay ? undefined : totals.shipMinor === 0 ? (plus ? 'FREE delivery with Plus' : 'FREE delivery') : `Delivery ${money(totals.shipMinor)}${freeOver}`}
          >
            {fast || onDay ? (
              <DeliverySpeed
                standard={{ label: 'Standard delivery', sub: `${arrivingText(eta, store, now)} · ${shipText}${freeOver}` }}
                fast={
                  fast
                    ? {
                        label: relativeDayName(fast.eta, store, now) === 'Today' ? 'Same-Day delivery' : 'One-Day delivery',
                        sub: `Arriving ${lcFirst(fastWhen)} · ${fastFeeText}`,
                      }
                    : undefined
                }
                day={onDay ? { label: `Your Delivery Day · ${weekdayName(plus?.deliveryDay ?? 0)}`, sub: `${arrivingText(onDay, store, now)} · ${shipText} · fewer boxes, fewer trips` } : undefined}
              />
            ) : null}
            {dayStore && plus && !plus.deliveryDay ? (
              <p className="m-0 text-[13px] text-ink-2">
                Get your orders together on one day each week.{' '}
                <a href={sp('/prime#delivery-day')} className="font-semibold text-ink underline underline-offset-2 hover:text-accent-ink">Choose your Delivery Day</a>
              </p>
            ) : null}
            {release ? (
              <p className="m-0 text-[13px] text-ink-2">
                {lines.length > 1 ? 'Your order includes a pre-order, so it all ships' : 'This pre-order ships'} when it’s released on{' '}
                <strong className="font-semibold text-ink">{releaseDate(new Date(release), store)}</strong>. You can cancel any time before then.
              </p>
            ) : null}
            <GiftOption max={GIFT_NOTE_MAX} wrapFee={wrapFee === null ? undefined : money(wrapFee)} />
            {isIN ? <GstOption nameMax={GST_NAME_MAX} /> : null}
          </StepCard>
          <section className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-[18px]" aria-labelledby="co-items-h">
            <h2 id="co-items-h" className="m-0 text-[13px] font-normal text-ink-3">Items ({count})</h2>
            {buy ? <p className="m-0 text-[13px] text-ink-3">Buy Now orders just this item. Your cart stays as it is.</p> : null}
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {lines.map((l) => (
                <li key={l.product.id} className="flex justify-between gap-3 text-[15px]">
                  <span className="min-w-0">
                    {l.product.title}
                    {buy ? (
                      <span className="block">
                        <BuyNowQty checkoutHref={sp('/checkout')} productId={l.product.id} qty={l.qty} stock={Math.min(l.product.stock, leftOf(l) ?? Infinity)} name={l.product.title} protection={buy.protection} size={buy.size} promo={promo?.code ?? promoTried?.code} />
                      </span>
                    ) : (
                      <span className="text-ink-3"> × {l.qty}</span>
                    )}
                    {l.size ? <span className="block text-[13px] text-ink-2">Size: {l.size}</span> : null}
                    {l.product.maxPerCustomer ? (
                      <span className={`block text-[13px]${overLimit.includes(l) ? ' font-semibold text-warn' : ' text-ink-3'}`}>{limitNote(l.product.maxPerCustomer, leftOf(l))}</span>
                    ) : null}
                    {l.discountMinor && l.discountMinor > (l.promoMinor ?? 0) + (l.qtyDiscountMinor ?? 0) ? (
                      <span className="block text-[13px] font-semibold text-good-strong">{l.coupon?.percentOff}% coupon applied · −{money(l.discountMinor - (l.promoMinor ?? 0) - (l.qtyDiscountMinor ?? 0))}</span>
                    ) : null}
                    {l.qtyDiscountMinor ? (
                      <span className="block text-[13px] font-semibold text-good-strong">{l.product.qtyDiscount?.percentOff}% quantity discount · −{money(l.qtyDiscountMinor)}</span>
                    ) : null}
                    {l.promoMinor ? <span className="block text-[13px] font-semibold text-good-strong">{promo?.code} · −{money(l.promoMinor)}</span> : null}
                    {l.protection?.added ? (
                      <span className="block text-[13px] text-ink-2">+ {protectionPlanName(store.id)} · {money(l.protection.unitMinor * l.qty)}</span>
                    ) : null}
                    {!l.available ? (
                      <span className="block text-[13px] font-semibold text-warn">⚠ No longer available</span>
                    ) : !l.inStock ? (
                      <span className="block text-[13px] font-semibold text-warn">⚠ Not enough stock</span>
                    ) : l.needsSize ? (
                      <span className="block text-[13px] font-semibold text-warn">⚠ Select a size</span>
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
          <PromoCode
            checkoutPath={sp('/checkout')}
            query={buy ? buyNowQuery(buy) : ''}
            applied={promo ? { code: promo.code, description: promo.description, savings: money(promoMinor) } : undefined}
            tried={promoTried}
          />
          <dl className="m-0 flex flex-col gap-2.5 text-[15px]">
            <div className="flex justify-between gap-3"><dt>Items</dt><dd className="m-0 tabular-nums">{money(totals.subtotalMinor)}</dd></div>
            {couponMinor > 0 ? (
              <div className="flex justify-between gap-3 text-good-strong"><dt>Coupon savings</dt><dd className="m-0 tabular-nums">−{money(couponMinor)}</dd></div>
            ) : null}
            {qtyDiscountMinor > 0 ? (
              <div className="flex justify-between gap-3 text-good-strong"><dt>Quantity discounts</dt><dd className="m-0 tabular-nums">−{money(qtyDiscountMinor)}</dd></div>
            ) : null}
            {promoMinor > 0 ? (
              <div className="flex justify-between gap-3 text-good-strong"><dt>Promotion ({promo?.code})</dt><dd className="m-0 tabular-nums">−{money(promoMinor)}</dd></div>
            ) : null}
            <div className="flex justify-between gap-3"><dt>Delivery</dt><dd className="m-0 tabular-nums">{bySpeed(shipText, fastFeeText)}</dd></div>
            {planMinor > 0 ? (
              <div className="flex justify-between gap-3"><dt>Protection plans</dt><dd className="m-0 tabular-nums">{money(planMinor)}</dd></div>
            ) : null}
            {wrapMinor > 0 ? (
              <div className="hidden justify-between gap-3 group-has-[#gift-wrap:checked]/co:flex"><dt>Gift wrap</dt><dd className="m-0 tabular-nums">{money(wrapMinor)}</dd></div>
            ) : null}
            {store.pricing.taxInclusive ? (
              <div className="flex justify-between gap-3 text-ink-3"><dt>Tax</dt><dd className="m-0">{store.pricing.taxNote ?? 'Inclusive of all taxes'}</dd></div>
            ) : (
              <div className="flex justify-between gap-3"><dt>Estimated tax</dt><dd className="m-0 tabular-nums">{money(totals.taxMinor)}</dd></div>
            )}
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <dt className="text-[18px] font-semibold">Total</dt>
              <dd className="m-0 text-[26px] font-bold tracking-[-0.01em] tabular-nums">{byWrap(
                bySpeed(money(totals.totalMinor), money(fastTotal)),
                bySpeed(money(totals.totalMinor + wrapMinor), money(fastTotal + wrapMinor)),
              )}</dd>
            </div>
          </dl>
          {blocked ? (
            <a href={productHref ?? sp('/cart')} className={buttonClasses({ variant: 'secondary', size: 'lg', block: true })}>{productHref ? 'Back to the product' : 'Update your cart'}</a>
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
