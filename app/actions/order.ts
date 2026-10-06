'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { siteOrigin } from '@/lib/origin';
import { cancelOrder, cancelPendingOrder, getOrder, isPaymentMethod, placeOrder } from '@/lib/data/orders';
import { resumeCardCheckout, startCardCheckout } from '@/lib/data/payments';
import { DataError } from '@/lib/data/errors';
import { buyNowQuery, readBuyNow } from '@/lib/buy-now';
import type { Order } from '@/lib/types';

/**
 * Checkout form → order. The database locks and reserves stock, prices every
 * line and computes the totals; nothing monetary is taken from the form. Card
 * orders are then paid on Stripe's hosted page; every other method is placed
 * immediately. A Buy Now checkout (hidden `buy` / `qty`) orders just that product.
 */
export async function submitCheckout(formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  const buyNow = readBuyNow(formData.get('buy'), formData.get('qty')) ?? undefined;
  // this checkout (Buy Now's keeps its product), with whatever else goes in the query
  const checkout = (extra: Record<string, string> = {}) => {
    const q = [buyNow ? buyNowQuery(buyNow) : '', new URLSearchParams(extra).toString()].filter(Boolean).join('&');
    return q ? `/checkout?${q}` : '/checkout';
  };
  const back = (extra?: Record<string, string>) => sp(checkout(extra));
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(checkout())}`));
  const client = await db();

  const method = formData.get('payMethod');
  if (!isPaymentMethod(method)) redirect(back({ error: 'payment_method_unavailable' }));

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
      gift: formData.get('gift') === 'on' ? { message: formData.get('giftMessage') } : undefined,
      speed: formData.get('shipSpeed') === 'fast' ? 'fast' : undefined,
      buyNow,
    });
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    failure = err;
  }
  if (!order) {
    const code = failure?.code ?? 'internal';
    redirect(back(code === 'invalid_input' && failure?.message ? { error: code, msg: failure.message } : { error: code }));
  }

  revalidatePath('/', 'layout');
  if (order.status === 'placed') redirect(sp(`/orders/${order.id}?placed=1`));

  // card: hand off to Stripe for exactly the total the database computed
  const origin = await siteOrigin();
  let url: string | null = null;
  try {
    url = await startCardCheckout(
      order,
      // backing out of Stripe returns to this checkout, Buy Now's included
      { successUrl: `${origin}${sp('/checkout/success')}`, cancelUrl: `${origin}${sp(buyNow ? `/checkout/cancel?${buyNowQuery(buyNow)}` : '/checkout/cancel')}` },
      origin,
    );
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    // release the reserved stock; the cart was never cleared
    await cancelPendingOrder(client, order.id).catch(() => undefined);
  }
  redirect(url ?? back({ error: 'payments_unavailable' }));
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


/**
 * "Complete payment" on an unpaid card order: back to Stripe (the same page while it's open), or
 * straight to the order when Stripe says it was paid after all.
 */
export async function payForOrder(orderId: string): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  const order = await getOrder(await db(), orderId);
  if (!order) redirect(sp('/orders'));
  if (order.status !== 'awaiting_payment') redirect(sp(`${page}?placed=0`));

  const origin = await siteOrigin();
  let url: string | null = null;
  let code: string | null = null;
  try {
    url = await resumeCardCheckout(
      order,
      { successUrl: `${origin}${sp('/checkout/success')}`, cancelUrl: `${origin}${sp('/checkout/cancel')}` },
      origin,
    );
  } catch (err) {
    code = err instanceof DataError ? err.code : 'internal';
    if (!(err instanceof DataError)) console.error('[orders] resume payment failed', orderId, err);
  }
  revalidatePath('/', 'layout');
  redirect(url ?? sp(`${page}?placed=${code ? '0' : '1'}${code ? `&error=${encodeURIComponent(code)}` : ''}`));
}
