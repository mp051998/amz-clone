import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { AddressFields } from '@/components/checkout/AddressFields';
import { PaymentSection } from '@/components/checkout/PaymentSection';
import { Wordmark } from '@/components/chrome/Wordmark';
import { submitCheckout } from '@/app/actions/order';
import { stripeConfigured } from '@/lib/stripe';
import { readUser } from '@/lib/auth';
import { getDefaultAddress } from '@/lib/addresses';
import { getCartLines, computeTotals } from '@/lib/cart';
import { deliveryDate } from '@/lib/dates';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';

export const metadata: Metadata = { title: 'Checkout | Amazon' };

const FORM_ID = 'checkout-form';

export default async function CheckoutPage() {
  const store = await getMarketplace();
  const cur = store.currency.code;
  const money = (minor: number) => formatMoney(minor, cur);
  const sp = (path: string) => storePath(store, path);
  const isIN = store.id === 'IN';
  const tld = store.hostname.split('.').pop() ?? 'com';
  const lines = await getCartLines(cur);
  // Prefill from the signed-in user's default saved address; guests get an empty
  // form (placeholders hint). Fall back to just the account name when no address
  // is saved yet.
  const user = await readUser();
  // checkout requires a signed-in account (orders are stored per signed-in user).
  if (!user) redirect(sp('/signin?next=/checkout'));
  const defName = user?.name ?? '';
  const savedAddr = user ? await getDefaultAddress() : undefined;
  const shipDefaults = savedAddr ?? (defName ? { name: defName } : undefined);
  const prefillName = savedAddr?.name ?? defName;

  if (lines.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] px-4 py-12 text-center">
          <h1 className="text-[24px] font-bold text-ink">Your cart is empty</h1>
          <p className="mt-2 text-[14px] text-ink-2">Add items before checking out.</p>
          <a href={sp('/')} className="mt-4 inline-block text-[14px] text-link hover:text-link-hover hover:underline">Continue shopping</a>
        </div>
      </AppShell>
    );
  }

  const count = lines.reduce((a, l) => a + l.qty, 0);
  const totals = computeTotals(lines.reduce((a, l) => a + l.lineTotalMinor, 0), store);

  const PlaceOrderButton = (
    <button type="submit" form={FORM_ID} className="flex h-[33px] w-full items-center justify-center rounded-pill bg-cta-yellow text-[14px] text-ink shadow-input hover:bg-cta-yellow-hover">
      Place your order
    </button>
  );

  return (
    <AppShell>
      {/* slim checkout header */}
      <div className="border-b border-line-3 bg-white">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-4 py-3">
          <span className="scale-90"><Wordmark tld={tld} tone="dark" /></span>
          <h1 className="text-[22px] font-normal text-ink">Secure checkout</h1>
          <span className="w-[80px]" />
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            <form id={FORM_ID} action={submitCheckout} className="space-y-5">
              <input type="hidden" name="schema" value={store.address.schema} />
              {/* shipping */}
              <section className="rounded-[8px] border border-line bg-white p-5">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-[18px] font-bold text-ink">1. Shipping address</h2>
                  {user ? (
                    <a href={sp('/account/addresses')} className="text-[13px] text-link hover:text-link-hover hover:underline">
                      {savedAddr ? 'Manage addresses' : 'Add an address'}
                    </a>
                  ) : null}
                </div>
                <AddressFields isIN={isIN} address={shipDefaults} />
              </section>

              {/* payment */}
              <PaymentSection
                methods={store.payments.map((pm) => pm.method)}
                curSymbol={store.currency.symbol}
                defaultName={prefillName}
                stripeCard={stripeConfigured}
              />

              {/* review */}
              <section className="rounded-[8px] border border-line bg-white p-5">
                <h2 className="mb-3 text-[18px] font-bold text-ink">3. Review items and delivery</h2>
                <p className="mb-3 text-[13px] text-success-deep">Estimated delivery: <b>{deliveryDate(3, store)}</b></p>
                <div className="space-y-3">
                  {lines.map((l) => (
                    <div key={l.product.id} className="flex items-center gap-3">
                      <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center bg-white">
                        <img src={l.product.image} alt={l.product.title} className="max-h-full max-w-full object-contain" />
                      </div>
                      <p className="line-clamp-2 flex-1 text-[13px] text-ink">{l.product.title}</p>
                      <span className="text-[12px] text-ink-2">Qty {l.qty}</span>
                      <span className="w-[80px] text-right text-[13px] font-medium text-ink">{money(l.lineTotalMinor)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 hidden sm:block sm:max-w-[240px]">{PlaceOrderButton}</div>
              </section>
            </form>
          </div>

          {/* order summary */}
          <aside className="lg:w-[300px] lg:shrink-0">
            <div className="sticky top-4 rounded-[8px] border border-line bg-white p-5">
              <div className="mb-3">{PlaceOrderButton}</div>
              <p className="mb-3 text-[11px] text-ink-2">
                {stripeConfigured
                  ? `By placing your order, you agree to this demo’s terms. Card payments are processed securely by Stripe in ${cur}; use test card 4242 4242 4242 4242.`
                  : 'By placing your order, you agree to this demo’s terms. No real charge is made.'}
              </p>
              <h2 className="border-b border-line-3 pb-2 text-[18px] font-bold text-ink">Order Summary</h2>
              <dl className="mt-2 space-y-1 text-[14px] text-ink">
                <div className="flex justify-between"><dt>Items ({count}):</dt><dd>{money(totals.subtotalMinor)}</dd></div>
                <div className="flex justify-between"><dt>Shipping:</dt><dd>{totals.shipMinor === 0 ? 'FREE' : money(totals.shipMinor)}</dd></div>
                {store.pricing.taxInclusive ? (
                  <div className="flex justify-between text-ink-2"><dt>Tax:</dt><dd>{store.pricing.taxNote ?? 'Inclusive of all taxes'}</dd></div>
                ) : (
                  <div className="flex justify-between"><dt>Estimated tax:</dt><dd>{money(totals.taxMinor)}</dd></div>
                )}
              </dl>
              <div className="mt-2 flex justify-between border-t border-line-3 pt-2 text-[18px] font-bold text-price-deal">
                <span>Order total:</span><span>{money(totals.totalMinor)}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
