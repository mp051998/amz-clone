import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { EmptyState, ProductFrame } from '@/components/decision';
import { buttonClasses } from '@/components/primitives/Button';
import { Alert } from '@/components/primitives/Alert';
import { CartQty } from '@/components/cart/CartQty';
import { SaveForLater, SwapButton } from '@/components/cart/CartActions';
import { CouponToggle } from '@/components/coupons/CouponToggle';
import { SavedForLater } from '@/components/cart/SavedForLater';
import { PairsWith } from '@/components/cart/PairsWith';
import { BrowsingHistory } from '@/components/product/BrowsingHistory';
import { cartEta, longDate, relativeDayName } from '@/components/orders/format';
import { removeItem } from '@/app/actions/cart';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { listCollections } from '@/lib/data/collections';
import { plusMembership } from '@/lib/data/plus';
import { accessoriesFor, alternativesFor, type Accessory, type Alternative } from '@/lib/decision/server';
import { shortTitle } from '@/lib/decision/verdict';
import { recentProducts } from '@/lib/recent-products';
import { viewerCart } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import type { Collection } from '@/lib/decision/types';
import type { CartLine, Market } from '@/lib/types';

export const metadata: Metadata = { title: 'Cart · Store' };

/** The shopper's collections (signed-in only): price-drop chips and the "Saved for later" list. */
async function savedLists(market: Market): Promise<Collection[]> {
  try {
    return await listCollections(await db(), market);
  } catch {
    return []; // collections are optional garnish on the cart
  }
}

/** Highest price each product was saved at in any collection — for price-drop chips. */
function savedPrices(lists: Collection[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of lists) {
    for (const i of c.items) out.set(i.product.id, Math.max(out.get(i.product.id) ?? 0, i.savedPriceMinor));
  }
  return out;
}

/** The cheapest-first cheaper alternative to the priciest line that isn't already in the cart. */
async function saving(lines: CartLine[]): Promise<{ line: CartLine; alt: Alternative } | null> {
  const line = [...lines].filter((l) => l.inStock).sort((a, b) => b.product.priceMinor - a.product.priceMinor)[0];
  if (!line) return null;
  try {
    const inCart = new Set(lines.map((l) => l.product.id));
    const alt = (await alternativesFor(line.product, 4)).find((a) => a.priceDeltaMinor < 0 && !inCart.has(a.product.id));
    return alt ? { line, alt } : null;
  } catch {
    return null;
  }
}

async function setup(lines: CartLine[]): Promise<Accessory[]> {
  try {
    return await accessoriesFor(lines.filter((l) => l.available).map((l) => l.product), 4);
  } catch {
    return [];
  }
}

export default async function CartPage() {
  const store = await getMarketplace();
  const cur = store.currency.code;
  const money = (minor: number) => formatMoney(minor, cur);
  const sp = (path: string) => storePath(store, path);
  const [cart, user] = await Promise.all([viewerCart(), readUser()]);
  const { lines, count, totals } = cart;
  const [lists, recent] = await Promise.all([
    user ? savedLists(store.id) : Promise.resolve([]),
    recentProducts(await db(), store.id, { exclude: lines.map((l) => l.product.id) }),
  ]);
  const later = lists.find((c) => c.kind === 'later');
  const savedSection = later ? <SavedForLater collectionId={later.id} items={later.items} sp={sp} /> : null;
  const history = <BrowsingHistory products={recent} store={store} />;

  if (lines.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto flex w-full max-w-page flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Cart</h1>
          <EmptyState
            title="Your cart is empty"
            action={
              user ? (
                <span className="flex flex-wrap gap-2">
                  <a href={sp('/s')} className={buttonClasses({ variant: 'dark' })}>Find something</a>
                  <a href={sp('/collections')} className={buttonClasses({ variant: 'secondary' })}>Open your collections</a>
                </span>
              ) : (
                // a guest's empty cart may only mean they are signed out: their account's cart comes back on sign in
                <span className="flex flex-wrap gap-2">
                  <a href={sp(`/signin?next=${encodeURIComponent('/cart')}`)} className={buttonClasses({ variant: 'primary' })}>Sign in to your account</a>
                  <a href={sp(`/signin?new=1&next=${encodeURIComponent('/cart')}`)} className={buttonClasses({ variant: 'secondary' })}>Create an account</a>
                </span>
              )
            }
          >
            {user ? (
              <>Tell us what you need and we&apos;ll rank the options for you.</>
            ) : (
              <>
                Signed in before? Items you added are saved to your account.{' '}
                <a href={sp('/deals')} className="text-ink underline underline-offset-2">Shop today&apos;s deals</a>
              </>
            )}
          </EmptyState>
          {savedSection}
          {history}
        </div>
      </AppShell>
    );
  }

  const now = new Date();
  const eta = cartEta(now, store);
  const etaText = relativeDayName(eta, store, now)?.toLowerCase() ?? `on ${longDate(eta, store)}`;
  const freeShip = totals.shipMinor === 0;
  const blocked = lines.some((l) => !l.inStock);
  const saved = savedPrices(lists);
  const [swap, accessories, plus] = await Promise.all([saving(lines), setup(lines), user ? db().then(plusMembership) : null]);
  const dropFor = (l: CartLine) => Math.max(0, (saved.get(l.product.id) ?? 0) - l.product.priceMinor);
  const dropSum = lines.reduce((s, l) => s + dropFor(l) * l.qty, 0);
  const discount = totals.discountMinor ?? 0;
  // the free-delivery threshold goes by what's paid for the items, after coupons
  const toFree = cart.freeShipThresholdMinor - (totals.subtotalMinor - discount);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Cart</h1>

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-[22px]">
            <section className="flex flex-col gap-2.5" aria-labelledby="items-h">
              <h2 id="items-h" className="m-0 text-[20px] font-semibold">Your items</h2>
              <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
                {lines.map((l) => {
                  const p = l.product;
                  const href = sp(`/product/${p.id}`);
                  const drop = dropFor(l);
                  return (
                    <li key={p.id} className="flex flex-wrap gap-3.5 border-t border-line-2 p-4 first:border-t-0">
                      <a href={href} className={`w-[88px] flex-none${l.available ? '' : ' opacity-50'}`} tabIndex={-1} aria-hidden>
                        <ProductFrame src={p.image} alt="" aspect="1/1" />
                      </a>
                      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
                        <div className="flex justify-between gap-3">
                          <a href={href} className="line-clamp-2 text-[17px] font-semibold leading-[1.25] text-ink no-underline">{p.title}</a>
                          <strong className="flex-none text-[18px] tabular-nums">{money(l.lineTotalMinor)}</strong>
                        </div>
                        {!l.available ? (
                          <span className="text-[14px] font-semibold text-warn">⚠ No longer available — remove it to check out.</span>
                        ) : p.stock === 0 ? (
                          <span className="text-[14px] font-semibold text-warn">⚠ Out of stock — remove it to check out.</span>
                        ) : !l.inStock ? (
                          <span className="text-[14px] font-semibold text-warn">⚠ Only {p.stock} left — lower the quantity to check out.</span>
                        ) : (
                          <span className="text-[14px] text-ink-2">
                            {p.stock <= 10 ? `Only ${p.stock} left` : 'In stock'} · {freeShip ? 'FREE delivery' : 'Delivery'} {etaText}
                            {l.qty > 1 ? <span className="text-ink-3"> · {money(p.priceMinor)} each</span> : null}
                          </span>
                        )}
                        {l.available && l.coupon ? (
                          <CouponToggle
                            productId={p.id}
                            percentOff={l.coupon.percentOff}
                            clipped={l.coupon.clipped}
                            signedIn={!!user}
                            market={store.id}
                            next="/cart"
                            compact
                          />
                        ) : null}
                        {l.discountMinor ? <span className="text-[13px] font-semibold text-good-strong">You save {money(l.discountMinor)} with the coupon</span> : null}
                        {drop > 0 ? (
                          <span className="self-start rounded-chip bg-good-bg px-2 py-1 text-[14px] font-semibold text-good-strong">
                            ↓ Price dropped {money(drop)} since you saved it
                          </span>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-2.5">
                          {l.available ? (
                            <>
                              <CartQty id={p.id} qty={l.qty} max={Math.min(30, Math.max(p.stock, l.qty))} name={p.title} />
                              <SaveForLater productId={p.id} name={p.title} market={store.id} signedIn={!!user} />
                            </>
                          ) : null}
                          <form action={removeItem}>
                            <input type="hidden" name="id" value={p.id} />
                            <button type="submit" className="min-h-11 px-1 text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink" aria-label={`Remove ${p.title}`}>
                              Remove
                            </button>
                          </form>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {savedSection}

            {swap ? (
              <section className="flex flex-col gap-2.5" aria-labelledby="save-h">
                <h2 id="save-h" className="m-0 text-[20px] font-semibold">Save money</h2>
                <div className="flex flex-wrap items-center gap-3.5 rounded-card border-[1.5px] border-ink bg-surface p-4">
                  <span className="w-[72px] flex-none">
                    <ProductFrame src={swap.alt.product.image} alt="" aspect="1/1" />
                  </span>
                  <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
                    <strong className="text-[17px] font-semibold">
                      Save {money(-swap.alt.priceDeltaMinor * swap.line.qty)} with the {shortTitle(swap.alt.product.title)}
                    </strong>
                    <span className="text-[14px] text-ink-2">
                      Instead of your {shortTitle(swap.line.product.title)}: {swap.alt.diff}.
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={sp(`/product/${swap.alt.product.id}`)} className={buttonClasses({ variant: 'secondary' })}>See alternative</a>
                    <SwapButton fromId={swap.line.product.id} toId={swap.alt.product.id} amount={money(-swap.alt.priceDeltaMinor * swap.line.qty)} />
                  </div>
                </div>
              </section>
            ) : null}

            <PairsWith items={accessories} store={store} id="setup-h" title="Complete your setup" note="Only items that pair with your cart" />
          </div>

          <aside className="flex flex-[1_1_300px] flex-col gap-3 rounded-card border border-line bg-surface p-[18px] md:sticky md:top-[128px]" aria-label="Order summary">
            {dropSum > 0 ? (
              <span className="rounded-image bg-good-bg px-2.5 py-2 text-[14px] font-semibold text-good-strong">↓ Prices in your cart dropped {money(dropSum)} since you saved them</span>
            ) : null}
            <dl className="m-0 flex flex-col gap-2 text-[15px]">
              <div className="flex justify-between gap-3"><dt>Subtotal ({count} {count === 1 ? 'item' : 'items'})</dt><dd className="m-0 font-bold tabular-nums">{money(totals.subtotalMinor)}</dd></div>
              {discount > 0 ? (
                <div className="flex justify-between gap-3 text-good-strong"><dt>Coupon savings</dt><dd className="m-0 font-bold tabular-nums">−{money(discount)}</dd></div>
              ) : null}
              <div className="flex justify-between gap-3"><dt>Delivery</dt><dd className="m-0 font-bold tabular-nums">{freeShip ? 'FREE' : money(totals.shipMinor)}</dd></div>
              {store.pricing.taxInclusive ? (
                <div className="flex justify-between gap-3 text-ink-3"><dt>Tax</dt><dd className="m-0">{store.pricing.taxNote ?? 'Inclusive of all taxes'}</dd></div>
              ) : (
                <div className="flex justify-between gap-3"><dt>Estimated tax</dt><dd className="m-0 font-bold tabular-nums">{money(totals.taxMinor)}</dd></div>
              )}
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                <dt className="text-[17px] font-semibold">Total</dt>
                <dd className="m-0 text-[22px] font-bold tracking-[-0.01em] tabular-nums">{money(totals.totalMinor)}</dd>
              </div>
            </dl>
            {plus ? (
              <span className="text-[13px] text-ink-2">Delivery is FREE with your Plus membership.</span>
            ) : !freeShip && toFree > 0 ? (
              <span className="text-[13px] text-ink-2">
                Add {money(toFree)} more for FREE delivery, or{' '}
                <a href={sp('/prime')} className="font-semibold text-ink underline underline-offset-2 hover:text-accent-ink">get it on every order with Plus</a>.
              </span>
            ) : null}
            {blocked ? (
              <Alert tone="warning">
                {lines.some((l) => !l.available)
                  ? 'Some items are no longer available. Remove them to check out.'
                  : 'Some items no longer have enough stock. Update them to check out.'}
              </Alert>
            ) : user ? (
              <a href={sp('/checkout')} className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}>Proceed to checkout</a>
            ) : (
              // no guest checkout: orders belong to an account, so guests sign in first (the cart comes along)
              <a href={sp(`/signin?next=${encodeURIComponent('/checkout')}`)} className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}>Sign in to check out</a>
            )}
            <span className="text-[13px] leading-[1.4] text-ink-2">
              Arrives {etaText}.{' '}
              {user ? 'You can review everything before you pay.' : 'Orders need an account. Sign in or create one — your cart comes with you.'}
            </span>
          </aside>
        </div>
        {history}
      </div>
    </AppShell>
  );
}
