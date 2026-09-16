import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Input } from '@/components/primitives/Input';
import { Wordmark } from '@/components/chrome/Wordmark';
import { placeOrder } from '@/app/actions/order';
import { getCartLines, computeTotals } from '@/lib/cart';
import { deliveryDate } from '@/lib/dates';

export const metadata: Metadata = { title: 'Checkout | Amazon.com' };

const usd = (minor: number) => `$${(minor / 100).toFixed(2)}`;
const FORM_ID = 'checkout-form';

export default async function CheckoutPage() {
  const lines = await getCartLines();

  if (lines.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] px-4 py-12 text-center">
          <h1 className="text-[24px] font-bold text-ink">Your cart is empty</h1>
          <p className="mt-2 text-[14px] text-ink-2">Add items before checking out.</p>
          <a href="/" className="mt-4 inline-block text-[14px] text-link hover:text-link-hover hover:underline">Continue shopping</a>
        </div>
      </AppShell>
    );
  }

  const count = lines.reduce((a, l) => a + l.qty, 0);
  const totals = computeTotals(lines.reduce((a, l) => a + l.lineTotalMinor, 0));

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
          <span className="scale-90"><Wordmark tld="com" /></span>
          <h1 className="text-[22px] font-normal text-ink">Secure checkout</h1>
          <span className="w-[80px]" />
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            <form id={FORM_ID} action={placeOrder} className="space-y-5">
              {/* shipping */}
              <section className="rounded-[8px] border border-line bg-white p-5">
                <h2 className="mb-3 text-[18px] font-bold text-ink">1. Shipping address</h2>
                <div className="grid max-w-[560px] grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input name="fullName" label="Full name" required defaultValue="Alex Morgan" />
                  <Input name="phone" label="Phone number" inputMode="numeric" required defaultValue="2065550142" />
                  <div className="sm:col-span-2"><Input name="line1" label="Address" required defaultValue="410 Terry Ave N" /></div>
                  <div className="sm:col-span-2"><Input name="line2" label="Apt, suite, etc. (optional)" /></div>
                  <Input name="city" label="City" required defaultValue="Seattle" />
                  <Input name="state" label="State" required defaultValue="WA" />
                  <Input name="postcode" label="ZIP Code" inputMode="numeric" required defaultValue="98109" />
                </div>
              </section>

              {/* payment */}
              <section className="rounded-[8px] border border-line bg-white p-5">
                <h2 className="mb-1 text-[18px] font-bold text-ink">2. Payment method</h2>
                <p className="mb-3 text-[12px] text-ink-2">Demo only — no real payment is processed. Any values work.</p>
                <div className="grid max-w-[560px] grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Input name="cardName" label="Name on card" defaultValue="Alex Morgan" /></div>
                  <div className="sm:col-span-2"><Input name="card" label="Card number" inputMode="numeric" placeholder="4242 4242 4242 4242" defaultValue="4242 4242 4242 4242" /></div>
                  <Input name="exp" label="Expiration (MM/YY)" placeholder="12/29" defaultValue="12/29" />
                  <Input name="cvc" label="CVV" inputMode="numeric" placeholder="123" defaultValue="123" />
                </div>
              </section>

              {/* review */}
              <section className="rounded-[8px] border border-line bg-white p-5">
                <h2 className="mb-3 text-[18px] font-bold text-ink">3. Review items and delivery</h2>
                <p className="mb-3 text-[13px] text-success-deep">Estimated delivery: <b>{deliveryDate(3)}</b></p>
                <div className="space-y-3">
                  {lines.map((l) => (
                    <div key={l.product.id} className="flex items-center gap-3">
                      <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center bg-white">
                        <img src={l.product.image} alt={l.product.title} className="max-h-full max-w-full object-contain" />
                      </div>
                      <p className="line-clamp-2 flex-1 text-[13px] text-ink">{l.product.title}</p>
                      <span className="text-[12px] text-ink-2">Qty {l.qty}</span>
                      <span className="w-[70px] text-right text-[13px] font-medium text-ink">{usd(l.lineTotalMinor)}</span>
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
              <p className="mb-3 text-[11px] text-ink-2">By placing your order, you agree to this demo&apos;s terms. No real charge is made.</p>
              <h2 className="border-b border-line-3 pb-2 text-[18px] font-bold text-ink">Order Summary</h2>
              <dl className="mt-2 space-y-1 text-[14px] text-ink">
                <div className="flex justify-between"><dt>Items ({count}):</dt><dd>{usd(totals.subtotalMinor)}</dd></div>
                <div className="flex justify-between"><dt>Shipping:</dt><dd>{totals.shipMinor === 0 ? 'FREE' : usd(totals.shipMinor)}</dd></div>
                <div className="flex justify-between"><dt>Estimated tax:</dt><dd>{usd(totals.taxMinor)}</dd></div>
              </dl>
              <div className="mt-2 flex justify-between border-t border-line-3 pt-2 text-[18px] font-bold text-price-deal">
                <span>Order total:</span><span>{usd(totals.totalMinor)}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
