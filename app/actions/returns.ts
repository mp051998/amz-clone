'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { DataError } from '@/lib/data/errors';
import { cancelReturn, chooseReturnMethod, isExchange, requestReturn } from '@/lib/data/returns';
import { reportNotReceived } from '@/lib/data/not-received';
import type { OrderReturn } from '@/lib/types';

const ORDER_ID = /^\d{3}-\d{7}-\d{7}$/;

/** The return-method fields (see ReturnMethodFields). */
const methodInput = (formData: FormData) => ({
  method: formData.get('method'),
  pickupPointId: formData.get('point'),
  pickupOn: formData.get('pickupOn'),
});

/**
 * The return form (bound to the order id): one `qty:<productId>` field per item, a reason, an
 * optional comment, the resolution (refund, a replacement for a store-fault reason, or `exchange`:
 * a replacement in the `size:<productId>` picked for each item, for one too small or large), where a
 * refund goes (`refundTo`: back to how they paid, or the store balance) and how it goes back
 * (`method`: dropped off, at `point` or anywhere, or picked up on `pickupOn`). The database checks
 * the window and what's left to return, and prices the refund; back to the order on success, or to
 * the form with the error. A return method that doesn't take still leaves the return started, to be
 * dropped off anywhere, and the order page says why.
 */
export async function startReturn(orderId: string, formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(`${page}/return`)}`));

  // an exchange is a replacement in the sizes picked
  const exchange = formData.get('resolution') === 'exchange';
  const items = [...formData.entries()]
    .filter(([k]) => k.startsWith('qty:'))
    .map(([k, v]) => {
      const productId = k.slice(4);
      const size = exchange ? formData.get(`size:${productId}`) : null;
      return { productId, qty: Number(v), ...(typeof size === 'string' && size ? { size } : {}) };
    })
    .filter((it) => it.qty > 0);
  let failure: DataError | null = null;
  let returned: OrderReturn | null = null;
  try {
    returned = await requestReturn(await db(), orderId, {
      items,
      reason: formData.get('reason'),
      comment: formData.get('comment'),
      resolution: exchange ? 'replacement' : formData.get('resolution'),
      refundTo: formData.get('refundTo'),
    });
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    failure = err;
  }
  if (failure) {
    const qs = new URLSearchParams({ error: failure.code });
    if (failure.detail) qs.set('field', failure.detail);
    redirect(sp(`${page}/return?${qs}`));
  }
  // dropping off anywhere is how every return starts
  const how = methodInput(formData);
  let methodError: string | null = null;
  if (returned && (how.method === 'pickup' || (typeof how.pickupPointId === 'string' && how.pickupPointId.trim()))) {
    try {
      returned = await chooseReturnMethod(await db(), returned.id, how);
    } catch (err) {
      if (!(err instanceof DataError)) throw err;
      methodError = err.detail ?? err.code;
    }
  }
  revalidatePath('/', 'layout');
  const done = returned && isExchange(returned) ? 'exchange' : returned?.resolution === 'replacement' ? 'replacement' : 'started';
  redirect(sp(`${page}?placed=0&return=${done}${methodError ? `&method_error=${encodeURIComponent(methodError)}` : ''}`));
}

/**
 * "Change return method" on an order page (bound to the order and return ids, both checked): the
 * return method fields, as on the return form.
 */
export async function changeReturnMethod(orderId: string, returnId: string, formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  let failure: DataError | null = null;
  try {
    await chooseReturnMethod(await db(), String(returnId), methodInput(formData));
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    failure = err;
  }
  revalidatePath('/', 'layout');
  redirect(
    sp(
      `${page}?placed=0&${
        failure
          ? failure.code === 'invalid_input' && failure.detail
            ? `method_error=${encodeURIComponent(failure.detail)}`
            : `error=${encodeURIComponent(failure.code)}`
          : 'return=method'
      }`,
    ),
  );
}

/** "Cancel return" on an order page (bound to the order and return ids, both checked). */
export async function cancelMyReturn(orderId: string, returnId: string): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  let code: string | null = null;
  try {
    await cancelReturn(await db(), String(returnId));
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(sp(`${page}?placed=0&${code ? `error=${encodeURIComponent(code)}` : 'return=cancelled'}`));
}

/**
 * "Package didn't arrive" on an order page (bound to the order id and the shopper's choice, both
 * checked): the whole order is refunded, or sent again at no charge.
 */
export async function reportMissing(orderId: string, resolution: string): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  let code: string | null = null;
  try {
    await reportNotReceived(await db(), orderId, resolution === 'replacement' ? 'replacement' : 'refund');
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(sp(`${page}?placed=0&${code ? `error=${encodeURIComponent(code)}` : `return=${resolution === 'replacement' ? 'missing-replacement' : 'missing'}`}`));
}
