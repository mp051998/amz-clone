'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { DataError } from '@/lib/data/errors';
import { cancelReturn, requestReturn } from '@/lib/data/returns';

const ORDER_ID = /^\d{3}-\d{7}-\d{7}$/;

/**
 * The return form (bound to the order id): one `qty:<productId>` field per item, a reason and an
 * optional comment. The database checks the window and what's left to return, and prices the
 * refund; back to the order on success, or to the form with the error.
 */
export async function startReturn(orderId: string, formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(`${page}/return`)}`));

  const items = [...formData.entries()]
    .filter(([k]) => k.startsWith('qty:'))
    .map(([k, v]) => ({ productId: k.slice(4), qty: Number(v) }))
    .filter((it) => it.qty > 0);
  let failure: DataError | null = null;
  try {
    await requestReturn(await db(), orderId, { items, reason: formData.get('reason'), comment: formData.get('comment') });
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    failure = err;
  }
  if (failure) {
    const qs = new URLSearchParams({ error: failure.code });
    if (failure.detail) qs.set('field', failure.detail);
    redirect(sp(`${page}/return?${qs}`));
  }
  revalidatePath('/', 'layout');
  redirect(sp(`${page}?placed=0&return=started`));
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
