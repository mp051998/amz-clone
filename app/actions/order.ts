'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { siteOrigin } from '@/lib/origin';
import { cancelOrder, cancelPendingOrder, isPaymentMethod, placeOrder } from '@/lib/data/orders';
import { startCardCheckout } from '@/lib/data/payments';
import { DataError } from '@/lib/data/errors';
import type { Order } from '@/lib/types';

/**
 * Checkout form → order. The database locks and reserves stock, prices every
 * line and computes the totals; nothing monetary is taken from the form. Card
 * orders are then paid on Stripe's hosted page; every other method is placed
 * immediately.
 */
export async function submitCheckout(formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (!(await readUser())) redirect(sp('/signin?next=/checkout'));
  const client = await db();

  const method = formData.get('payMethod');
  if (!isPaymentMethod(method)) redirect(sp('/checkout?error=payment_method_unavailable'));

  let order: Order | null = null;
  let failure: DataError | null = null;
  try {
    order = await placeOrder(client, market, {
      paymentMethod: method,
      shipping: {
        fullName: formData.get('fullName'),
        phone: formData.get('phone'),
        line1: formData.get('line1'),
        line2: formData.get('line2'),
        landmark: formData.get('landmark'),
        city: formData.get('city'),
        state: formData.get('state'),
        postcode: formData.get('postcode'),
        addressType: formData.get('addressType'),
      },
    });
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    failure = err;
  }
  if (!order) {
    const qs = new URLSearchParams({ error: failure?.code ?? 'internal' });
    if (failure?.code === 'invalid_input' && failure.message) qs.set('msg', failure.message);
    redirect(sp(`/checkout?${qs}`));
  }

  revalidatePath('/', 'layout');
  if (order.status === 'placed') redirect(sp(`/orders/${order.id}?placed=1`));

  // card: hand off to Stripe for exactly the total the database computed
  const origin = await siteOrigin();
  let url: string | null = null;
  try {
    url = await startCardCheckout(
      order,
      { successUrl: `${origin}${sp('/checkout/success')}`, cancelUrl: `${origin}${sp('/checkout/cancel')}` },
      origin,
    );
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    // release the reserved stock; the cart was never cleared
    await cancelPendingOrder(client, order.id).catch(() => undefined);
  }
  redirect(url ?? sp('/checkout?error=payments_unavailable'));
}

/** Order numbers look like 114-1234567-1234567 (US) / 402-… (IN). */
const ORDER_ID = /^\d{3}-\d{7}-\d{7}$/;

/**
 * "Cancel order" on an order page (bound to the order id, which the client could change —
 * so it's checked, and the database only lets owners cancel their own unshipped orders).
 */
export async function cancelMyOrder(orderId: string): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  let code: string | null = null;
  try {
    await cancelOrder(await db(), orderId);
  } catch (err) {
    code = err instanceof DataError ? err.code : 'internal';
    if (!(err instanceof DataError)) console.error('[orders] cancel failed', orderId, err);
  }
  revalidatePath('/', 'layout');
  redirect(sp(`${page}?placed=0&${code ? `error=${encodeURIComponent(code)}` : 'cancelled=1'}`));
}

