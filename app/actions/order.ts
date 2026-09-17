'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { computeTotals, getCartLines, writeCart } from '@/lib/cart';
import { newOrderId, writeOrder, type StoredOrder } from '@/lib/orders';
import { readUser } from '@/lib/auth';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { stripe, stripeConfigured } from '@/lib/stripe';

/** card network from the leading digit (loose, demo-only). */
function cardBrand(digits: string): string {
  const d = digits[0];
  if (d === '4') return 'Visa';
  if (d === '5') return 'Mastercard';
  if (d === '3') return 'Amex';
  if (d === '6') return 'RuPay';
  return 'Card';
}

/** short label describing how the order was paid, for the confirmation + orders list. */
function payLabel(method: string, digits: string): string {
  switch (method) {
    case 'giftcard': return 'Amazon gift card balance';
    case 'upi': return 'UPI';
    case 'netbanking': return 'Net banking';
    case 'cod': return 'Cash on Delivery';
    case 'emi': return 'EMI';
    case 'amazonpay': return 'Amazon Pay balance';
    case 'card':
    default: return `${cardBrand(digits)} ending ${digits.slice(-4) || '4242'}`;
  }
}

/** Place the order: snapshot the cart, persist it, clear the cart, go to confirmation. */
export async function placeOrder(formData: FormData): Promise<void> {
  const store = await getMarketplace();
  // orders belong to a signed-in account — guests must sign in first.
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/checkout'));
  const cur = store.currency.code;
  const lines = await getCartLines(cur);
  if (lines.length === 0) redirect(storePath(store, '/cart'));

  const subtotal = lines.reduce((a, l) => a + l.lineTotalMinor, 0);
  const totals = computeTotals(subtotal, store);

  const digits = String(formData.get('card') ?? '').replace(/\D/g, '');
  const method = String(formData.get('payMethod') ?? 'card');
  const order: StoredOrder = {
    id: newOrderId(),
    ts: Date.now(),
    // snapshot the per-unit price already in the store currency
    items: lines.map((l) => ({ id: l.product.id, q: l.qty, p: Math.round(l.lineTotalMinor / l.qty) })),
    cur,
    sub: totals.subtotalMinor,
    ship: totals.shipMinor,
    tax: totals.taxMinor,
    tot: totals.totalMinor,
    name: String(formData.get('fullName') ?? 'Guest').slice(0, 40),
    city: String(formData.get('city') ?? '').slice(0, 30),
    zip: String(formData.get('postcode') ?? '').slice(0, 10),
    last4: digits.slice(-4) || '4242',
    pay: payLabel(method, digits),
  };

  await writeOrder(order);
  await writeCart({});
  revalidatePath('/', 'layout');
  redirect(storePath(store, `/orders/${order.id}?placed=1`));
}

/** absolute origin of the current request, for Stripe's absolute success/cancel URLs. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3100';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Card payments go through Stripe Checkout (hosted, PCI-compliant — the card is
 * entered on Stripe, never on our page). The session is created in the active
 * store's currency (USD for amazon.com, INR for amazon.in) with shipping and tax
 * as their own line items so Stripe's total matches computeTotals exactly. The
 * order isn't written until the return trip confirms payment (checkout/success),
 * with the snapshot carried in session metadata for an authoritative, idempotent
 * finalize.
 */
export async function startStripeCheckout(formData: FormData): Promise<void> {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  // orders belong to a signed-in account — guests must sign in first.
  if (!(await readUser())) redirect(sp('/signin?next=/checkout'));
  if (!stripe) redirect(sp('/checkout?error=stripe'));

  const cur = store.currency.code;
  const lines = await getCartLines(cur);
  if (lines.length === 0) redirect(sp('/cart'));

  const totals = computeTotals(lines.reduce((a, l) => a + l.lineTotalMinor, 0), store);
  const currency = cur.toLowerCase();
  const origin = await siteOrigin();

  const lineItems: Array<{ quantity: number; price_data: { currency: string; unit_amount: number; product_data: { name: string; images?: string[] } } }> =
    lines.map((l) => ({
      quantity: l.qty,
      price_data: {
        currency,
        unit_amount: Math.round(l.lineTotalMinor / l.qty),
        product_data: { name: l.product.title.slice(0, 120), images: origin.startsWith('https') ? [`${origin}${l.product.image}`] : undefined },
      },
    }));
  if (totals.shipMinor > 0) lineItems.push({ quantity: 1, price_data: { currency, unit_amount: totals.shipMinor, product_data: { name: 'Shipping' } } });
  if (totals.taxMinor > 0) lineItems.push({ quantity: 1, price_data: { currency, unit_amount: totals.taxMinor, product_data: { name: 'Estimated tax' } } });

  const orderId = newOrderId();
  // compact snapshot: id~qty~unitPrice, capped to Stripe's 500-char metadata limit.
  const items = lines.map((l) => `${l.product.id}~${l.qty}~${Math.round(l.lineTotalMinor / l.qty)}`).join('|').slice(0, 480);

  let url: string | null = null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}${sp('/checkout/success')}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${sp('/checkout')}?canceled=1`,
      metadata: {
        orderId,
        cur,
        sub: String(totals.subtotalMinor),
        ship: String(totals.shipMinor),
        tax: String(totals.taxMinor),
        tot: String(totals.totalMinor),
        name: String(formData.get('fullName') ?? 'Guest').slice(0, 40),
        city: String(formData.get('city') ?? '').slice(0, 30),
        zip: String(formData.get('postcode') ?? '').slice(0, 10),
        items,
      },
    });
    url = session.url;
  } catch (err) {
    console.error('[stripe] checkout session create failed', err);
    redirect(sp('/checkout?error=stripe'));
  }
  redirect(url ?? sp('/checkout?error=stripe'));
}

/** Checkout form dispatcher: card → Stripe when configured, everything else (UPI,
 *  COD, net banking, …) stays on the demo order flow. */
export async function submitCheckout(formData: FormData): Promise<void> {
  const method = String(formData.get('payMethod') ?? 'card');
  if (method === 'card' && stripeConfigured) {
    await startStripeCheckout(formData);
    return;
  }
  await placeOrder(formData);
}
