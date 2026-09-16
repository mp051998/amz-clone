import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Price } from '@/components/primitives/Price';
import { CartQty } from '@/components/cart/CartQty';
import { removeItem } from '@/app/actions/cart';
import { getCartLines, computeTotals } from '@/lib/cart';

export const metadata: Metadata = { title: 'Amazon.com Shopping Cart' };

const usd = (minor: number) => `$${(minor / 100).toFixed(2)}`;

export default async function CartPage() {
  const lines = await getCartLines();
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const { subtotalMinor } = computeTotals(lines.reduce((a, l) => a + l.lineTotalMinor, 0));

  if (lines.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[1500px] px-4 py-6">
          <div className="rounded-[8px] bg-white p-8 shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div>
                <h1 className="text-[28px] font-normal text-ink">Your Amazon Cart is empty</h1>
                <p className="mt-1 text-[14px] text-ink-2">
                  Check your Saved for later items below or <a href="/" className="text-link hover:text-link-hover hover:underline">continue shopping</a>.
                </p>
                <a href="/" className="mt-4 inline-flex h-[33px] items-center rounded-pill bg-cta-yellow px-5 text-[14px] text-ink hover:bg-cta-yellow-hover">
                  Shop today&apos;s deals
                </a>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] px-4 py-4">
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* items */}
          <div className="flex-1 rounded-[8px] bg-white p-5 shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
            <div className="flex items-end justify-between border-b border-line-3 pb-2">
              <h1 className="text-[28px] font-normal text-ink">Shopping Cart</h1>
              <span className="hidden text-[13px] text-ink-2 sm:block">Price</span>
            </div>

            {lines.map((l) => (
              <div key={l.product.id} className="flex gap-4 border-b border-line-3 py-4">
                <a href={`/product/${l.product.id}`} className="flex h-[140px] w-[140px] shrink-0 items-center justify-center bg-white">
                  <img src={l.product.image} alt={l.product.title} className="max-h-full max-w-full object-contain" />
                </a>
                <div className="min-w-0 flex-1">
                  <a href={`/product/${l.product.id}`} className="line-clamp-2 text-[17px] font-medium text-ink hover:text-link-hover hover:underline">{l.product.title}</a>
                  <p className="mt-1 text-[12px] text-success">In Stock</p>
                  <p className="text-[12px] text-ink-2">Ships from {l.product.shipsFrom} · Sold by {l.product.seller}</p>
                  {l.product.deal ? <p className="mt-0.5 text-[12px] text-price-deal">Limited time deal</p> : null}
                  <div className="mt-2 flex items-center gap-3 text-[13px]">
                    <CartQty id={l.product.id} qty={l.qty} />
                    <span className="text-line-2">|</span>
                    <form action={removeItem}>
                      <input type="hidden" name="id" value={l.product.id} />
                      <button type="submit" className="text-link-teal hover:text-brand-count hover:underline">Delete</button>
                    </form>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <Price minor={l.lineTotalMinor} currency="USD" size={17} />
                  {l.qty > 1 ? <p className="mt-1 text-[12px] text-ink-2">{usd(l.product.priceMinor)} each</p> : null}
                </div>
              </div>
            ))}

            <div className="pt-3 text-right text-[18px] text-ink">
              Subtotal ({count} {count === 1 ? 'item' : 'items'}): <span className="font-bold">{usd(subtotalMinor)}</span>
            </div>
          </div>

          {/* summary */}
          <aside className="lg:w-[300px] lg:shrink-0">
            <div className="rounded-[8px] bg-white p-5 shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
              {subtotalMinor >= 3500 ? (
                <p className="mb-2 text-[13px] text-success-deep">
                  <span className="mr-1">✓</span>Your order qualifies for FREE Shipping.
                </p>
              ) : (
                <p className="mb-2 text-[13px] text-ink-2">Add {usd(3500 - subtotalMinor)} of eligible items to qualify for FREE Shipping.</p>
              )}
              <p className="text-[18px] text-ink">
                Subtotal ({count} {count === 1 ? 'item' : 'items'}): <span className="font-bold">{usd(subtotalMinor)}</span>
              </p>
              <a href="/checkout" className="mt-3 flex h-[33px] w-full items-center justify-center rounded-pill bg-cta-yellow text-[14px] text-ink hover:bg-cta-yellow-hover">
                Proceed to checkout
              </a>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
