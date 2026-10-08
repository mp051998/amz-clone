'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { fileClaim, withdrawClaim } from '@/lib/data/atoz-claims';
import { DataError } from '@/lib/data/errors';
import { storePath } from '@/lib/marketplace';
import { getMarket } from '@/lib/session';
import { db } from '@/lib/supabase/server';

const ORDER_ID = /^\d{3}-\d{7}-\d{7}$/;

/**
 * The A-to-z Guarantee claim form (bound to the order id): the seller, what went wrong
 * (`reason`) and what happened (`details`). The database checks it can be filed; back to the
 * order on success, or to the form with the error, its detail and the seller chosen.
 */
export async function fileMyClaim(orderId: string, formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(`${page}/claim`)}`));
  const seller = formData.get('seller');
  let failure: DataError | null = null;
  try {
    await fileClaim(await db(), orderId, { seller, reason: formData.get('reason'), details: formData.get('details') });
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    failure = err;
  }
  if (failure) {
    const qs = new URLSearchParams({ error: failure.code });
    if (failure.detail) qs.set('detail', failure.detail);
    if (typeof seller === 'string' && seller) qs.set('seller', seller);
    redirect(sp(`${page}/claim?${qs}`));
  }
  revalidatePath('/', 'layout');
  redirect(sp(`${page}?placed=0&claim=filed#claims`));
}

/** Withdraw a claim under review from the order page (bound to the order and claim ids). */
export async function withdrawMyClaim(orderId: string, claimId: string): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) redirect(sp('/orders'));
  const page = `/orders/${encodeURIComponent(orderId)}`;
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(page)}`));
  let code: string | null = null;
  try {
    await withdrawClaim(await db(), String(claimId));
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(sp(`${page}?placed=0&${code ? `error=${encodeURIComponent(code)}` : 'claim=withdrawn'}#claims`));
}
