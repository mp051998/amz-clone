import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { writeCart } from '@/lib/cart';
import { getOrder, writeOrder, type StoredOrder, type StoredOrderItem } from '@/lib/orders';
import type { CurrencyCode } from '@/lib/contracts';

/** card network from a Stripe brand string, mapped to our short labels. */
function brandLabel(brand?: string | null): string {
  switch (brand) {
    case 'visa': return 'Visa';
    case 'mastercard': return 'Mastercard';
    case 'amex': return 'Amex';
    case 'discover': return 'Discover';
    case 'rupay': return 'RuPay';
    default: return 'Card';
  }
}

/**
 * Stripe Checkout return trip. Stripe redirects here with the session id after the
 * card is charged on its hosted page. We confirm the payment, then finalize the
 * order from the snapshot carried in session metadata — idempotently, so a refresh
 * or a double return doesn't create duplicate orders. Nothing is trusted from the
 * client beyond the session id; totals come from our metadata, payment state from
 * Stripe.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!stripe || !sessionId) redirect(sp('/checkout?error=stripe'));

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent.latest_charge'],
    });
  } catch (err) {
    console.error('[stripe] session retrieve failed', err);
    redirect(sp('/checkout?error=stripe'));
  }

  const meta = session.metadata ?? {};
  const orderId = meta.orderId;
  if (!orderId) redirect(sp('/checkout?error=stripe'));

  // idempotent: if this order was already finalized, just show it.
  const existing = await getOrder(orderId);
  if (existing) redirect(sp(`/orders/${orderId}?placed=1`));

  if (session.payment_status !== 'paid') redirect(sp('/checkout?canceled=1'));

  // card brand + last4 from the charge, when available.
  const pi = session.payment_intent;
  const charge = pi && typeof pi === 'object' ? pi.latest_charge : null;
  const card = charge && typeof charge === 'object' ? charge.payment_method_details?.card : null;
  const last4 = card?.last4 ?? '';
  const pay = `${brandLabel(card?.brand)}${last4 ? ` ending ${last4}` : ''}`;

  const items: StoredOrderItem[] = (meta.items ?? '')
    .split('|')
    .filter(Boolean)
    .map((chunk) => {
      const [id, q, p] = chunk.split('~');
      return { id, q: Number(q) || 1, p: Number(p) || 0 };
    });

  const order: StoredOrder = {
    id: orderId,
    ts: Date.now(),
    items,
    cur: (meta.cur as CurrencyCode) ?? store.currency.code,
    sub: Number(meta.sub) || 0,
    ship: Number(meta.ship) || 0,
    tax: Number(meta.tax) || 0,
    tot: Number(meta.tot) || 0,
    name: meta.name ?? 'Guest',
    city: meta.city ?? '',
    zip: meta.zip ?? '',
    last4: last4 || '0000',
    pay,
  };

  await writeOrder(order);
  await writeCart({});
  redirect(sp(`/orders/${orderId}?placed=1`));
}
