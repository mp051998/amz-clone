'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { siteOrigin } from '@/lib/origin';
import { archiveOrder, cancelOrder, cancelOrderItems, cancelPendingOrder, getOrder, isPaymentMethod, isShipSpeed, payCodOrder, placeOrder, setOrderAddress, setOrderInstructions } from '@/lib/data/orders';
import { resumeCardCheckout, startCardCheckout } from '@/lib/data/payments';
import { DataError } from '@/lib/data/errors';
import { isSplitMethod } from '@/lib/data/balance';
import { leaveSellerFeedback, removeSellerFeedback } from '@/lib/data/seller-feedback';
import { deliveryReasons, leaveDeliveryFeedback, removeDeliveryFeedback } from '@/lib/data/delivery-feedback';
import { buyNowQuery, readBuyNow } from '@/lib/buy-now';
import { readPromoCode } from '@/lib/promo';
import type { Order, ShipSpeed } from '@/lib/types';

/**
 * Checkout form → order. The database locks and reserves stock, prices every
 * line and computes the totals; nothing monetary is taken from the form. Card
 * orders are then paid on Stripe's hosted page; every other method is placed
 * immediately. A Buy Now checkout (hidden `buy` / `qty`) orders just that product.
 */
export async function submitCheckout(formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  const buyNow = readBuyNow(formData.get('buy'), formData.get('qty'), formData.get('protection'), formData.get('size'), formData.get('exchange'), formData.get('condition')) ?? undefined;
  // this checkout (Buy Now's keeps its product), with whatever else goes in the query
  const checkout = (extra: Record<string, string> = {}) => {
    const q = [buyNow ? buyNowQuery(buyNow) : '', new URLSearchParams(extra).toString()].filter(Boolean).join('&');
    return q ? `/checkout?${q}` : '/checkout';
  };
  const back = (extra?: Record<string, string>) => sp(checkout(extra));
  // a promotion code applied at checkout stays applied when something else goes wrong
  const promo = readPromoCode(formData.get('promo'));
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(checkout())}`));
  const client = await db();

  const method = formData.get('payMethod');
  if (!isPaymentMethod(method)) redirect(back({ ...(promo ? { promo } : {}), error: 'payment_method_unavailable' }));

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
        instructions: formData.get('instructions'),
      },
      pickupPoint: typeof formData.get('pickupPoint') === 'string' && formData.get('pickupPoint') ? String(formData.get('pickupPoint')) : undefined,
      gift: formData.get('gift') === 'on' ? { message: formData.get('giftMessage'), wrap: formData.get('giftWrap') === 'on' } : undefined,
      speed: isShipSpeed(formData.get('shipSpeed')) ? (formData.get('shipSpeed') as ShipSpeed) : undefined,
      buyNow,
      emiMonths: method === 'emi' ? Number(formData.get('emiTenure')) || undefined : undefined,
      promoCode: promo,
      // net banking and EMI name the bank, for its Bank Offer
      bank: method === 'netbanking' ? formData.get('bank') : method === 'emi' ? formData.get('emiBank') : undefined,
      // "Use your balance" alongside card, UPI or net banking
      useBalance: formData.get('useBalance') === 'on' && isSplitMethod(method),
      // India: "Use GST invoice", sent only when ticked
      gst: formData.get('gst') === 'on' ? { gstin: formData.get('gstin'), name: formData.get('gstName') } : undefined,
    });
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    failure = err;
  }
  if (!order) {
    const code = failure?.code ?? 'internal';
    if (code.startsWith('promo_')) redirect(back({ error: code, ...(failure?.detail ? { detail: failure.detail } : {}) }));
    const keep: Record<string, string> = promo ? { promo } : {};
    redirect(back(code === 'invalid_input' && failure?.message ? { ...keep, error: code, msg: failure.message } : { ...keep, error: code }));
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
      // Stripe's page offers to save the card, and shows the shopper's saved cards
      await readUser(),
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
 * The "Cancel items" form (bound to the order id): one `item` checkbox per line to cancel.
 * Back to the order on success (`cancelled=1` when that was every item, so the whole order),
 * or to the form with the error.
 */
export async function cancelMyItems(orderId: string, formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(`${page}/cancel`)}`));
  let order: Order | null = null;
  let code: string | null = null;
  try {
    order = await cancelOrderItems(await db(), orderId, formData.getAll('item'));
  } catch (err) {
    code = err instanceof DataError ? err.code : 'internal';
    if (!(err instanceof DataError)) console.error('[orders] cancel items failed', orderId, err);
  }
  if (!order) redirect(sp(`${page}/cancel?error=${encodeURIComponent(code ?? 'internal')}`));
  revalidatePath('/', 'layout');
  redirect(sp(`${page}?placed=0&cancelled=${order.status === 'cancelled' ? '1' : 'items'}`));
}

/**
 * "Archive order" / "Unarchive order" on an order page (bound to the id and the direction; the
 * database checks the order is the caller's). Back to the order, which says where it went.
 */
export async function archiveMyOrder(orderId: string, archived: boolean): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  let code: string | null = null;
  try {
    await archiveOrder(await db(), orderId, archived === true);
  } catch (err) {
    code = err instanceof DataError ? err.code : 'internal';
    if (!(err instanceof DataError)) console.error('[orders] archive failed', orderId, err);
  }
  revalidatePath('/orders');
  redirect(sp(`${page}?placed=0&${code ? `error=${encodeURIComponent(code)}` : `archived=${archived === true ? 1 : 0}`}`));
}

/**
 * "Save instructions" on an order page (bound to the id): the order's delivery instructions, until
 * it's out for delivery. Back to the order, which confirms the change or says why it didn't go through.
 */
export async function updateOrderInstructions(orderId: string, formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  let code: string | null = null;
  let cleared = false;
  try {
    cleared = !(await setOrderInstructions(await db(), orderId, formData.get('instructions'))).shipTo.instructions;
  } catch (err) {
    code = err instanceof DataError ? err.code : 'internal';
    if (!(err instanceof DataError)) console.error('[orders] instructions failed', orderId, err);
  }
  revalidatePath(page);
  redirect(sp(`${page}?placed=0&${code ? `error=${encodeURIComponent(code)}` : `instructions=${cleared ? 'cleared' : 'saved'}`}`));
}

/**
 * "Deliver here" on an order page (bound to the id): send the order to the picked saved address,
 * while it's being prepared. Back to the order, which confirms the change or says why it didn't go through.
 */
export async function changeOrderAddress(orderId: string, formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  let code: string | null = null;
  try {
    await setOrderAddress(await db(), orderId, formData.get('addressId'));
  } catch (err) {
    code = err instanceof DataError ? err.code : 'internal';
    if (!(err instanceof DataError)) console.error('[orders] address change failed', orderId, err);
  }
  revalidatePath(page);
  redirect(sp(`${page}?placed=0&${code ? `error=${encodeURIComponent(code)}` : 'address=changed'}`));
}

/**
 * "Pay now" on a Pay on Delivery order (bound to the id): pay it online (UPI, net banking or the
 * Amazon Pay balance) before it arrives. Back to the order, which confirms it or says why not.
 */
export async function payCodNow(orderId: string, formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  let code: string | null = null;
  try {
    await payCodOrder(await db(), orderId, formData.get('method'), formData.get('bank'));
  } catch (err) {
    code = err instanceof DataError ? err.code : 'internal';
    if (!(err instanceof DataError)) console.error('[orders] pay now failed', orderId, err);
  }
  revalidatePath('/', 'layout');
  redirect(sp(`${page}?placed=0&${code ? `error=${encodeURIComponent(code)}#pay-now` : 'paid=1'}`));
}

/** "Leave seller feedback" for one seller in a delivered order (or change it), or remove it. */
export async function rateSeller(orderId: string, seller: string, formData: FormData): Promise<void> {
  await sellerFeedbackAction(orderId, async (client) => {
    await leaveSellerFeedback(client, orderId, seller, {
      rating: formData.get('rating'),
      arrivedOnTime: formData.get('onTime'),
      asDescribed: formData.get('asDescribed'),
      comment: formData.get('comment'),
    });
    return 'saved';
  });
}

export async function removeSellerRating(orderId: string, seller: string): Promise<void> {
  await sellerFeedbackAction(orderId, async (client) => {
    await removeSellerFeedback(client, orderId, seller);
    return 'removed';
  });
}

/** "How was your delivery?" on a delivered order (or change it), or remove it. */
export async function rateDelivery(orderId: string, formData: FormData): Promise<void> {
  await sellerFeedbackAction(orderId, async (client) => {
    const rating = formData.get('rating');
    // both lists are in the form; only the chosen thumb's reasons count
    const allowed: string[] = rating === 'up' || rating === 'down' ? deliveryReasons(rating === 'up') : [];
    await leaveDeliveryFeedback(client, orderId, {
      positive: rating,
      reasons: formData.getAll('reasons').filter((r) => typeof r === 'string' && allowed.includes(r)),
      comment: formData.get('comment'),
    });
    return 'saved';
  }, 'delivery');
}

export async function removeDeliveryRating(orderId: string): Promise<void> {
  await sellerFeedbackAction(orderId, async (client) => {
    await removeDeliveryFeedback(client, orderId);
    return 'removed';
  }, 'delivery');
}

async function sellerFeedbackAction(orderId: string, run: (client: Awaited<ReturnType<typeof db>>) => Promise<string>, kind: 'seller' | 'delivery' = 'seller'): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  let result: string;
  try {
    result = `${kind === 'delivery' ? 'delivery' : 'feedback'}=${await run(await db())}`;
  } catch (err) {
    result = `error=${encodeURIComponent(err instanceof DataError ? err.code : 'internal')}`;
    if (!(err instanceof DataError)) console.error(`[orders] ${kind} feedback failed`, orderId, err);
  }
  revalidatePath(page);
  redirect(sp(`${page}?placed=0&${result}#${kind}-feedback`));
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
      await readUser(),
    );
  } catch (err) {
    code = err instanceof DataError ? err.code : 'internal';
    if (!(err instanceof DataError)) console.error('[orders] resume payment failed', orderId, err);
  }
  revalidatePath('/', 'layout');
  redirect(url ?? sp(`${page}?placed=${code ? '0' : '1'}${code ? `&error=${encodeURIComponent(code)}` : ''}`));
}
