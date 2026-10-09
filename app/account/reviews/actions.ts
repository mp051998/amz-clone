'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { DataError } from '@/lib/data/errors';
import { deleteReview, rateProduct } from '@/lib/data/reviews';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';

/** Your reviews → Delete, bound to the review id; back to the page with what happened. */
export async function deleteMyReview(reviewId: string): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => storePath(store, `/account/reviews?${qs}`);
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/account/reviews'));
  let code: string | null = null;
  try {
    await deleteReview(await db(), String(reviewId));
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout'); // the product page's reviews and rating
  redirect(back(code ? `error=${encodeURIComponent(code)}` : 'done=deleted'));
}

/** Your reviews → "Rate it": the star pressed (form field `rating`) rates the product, bound to its id. */
export async function rateMyPurchase(productId: string, form: FormData): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => storePath(store, `/account/reviews?${qs}`);
  const user = await readUser();
  if (!user) redirect(storePath(store, '/signin?next=/account/reviews'));
  let code: string | null = null;
  try {
    await rateProduct(await db(), String(productId), user.id, Number(form.get('rating')));
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout'); // the product page's rating
  redirect(back(code ? `error=${encodeURIComponent(code)}` : 'done=rated'));
}
