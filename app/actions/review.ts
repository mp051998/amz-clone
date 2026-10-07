'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import * as reviews from '@/lib/data/reviews';
import { uploadReviewPhoto as storeReviewPhoto } from '@/lib/data/review-photos';
import { DataError } from '@/lib/data/errors';
import type { Review, ReviewPhoto } from '@/lib/types';

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; code: string; message: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof DataError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}

async function requireUser() {
  const user = await readUser();
  if (!user) throw new DataError('not_authenticated');
  return user;
}

export async function submitReview(
  productId: string,
  input: { rating: number; title: string; body: string; authorName?: string; photos?: string[] },
): Promise<ActionResult<{ review: Review }>> {
  return run(async () => {
    const user = await requireUser();
    const review = await reviews.upsertReview(await db(), productId, user.id, input);
    revalidatePath(`/product/${productId}`);
    return { review };
  });
}

/** Upload one photo (form field `photo`) for the caller's review; it shows once they submit the review. */
export async function uploadReviewPhoto(form: FormData): Promise<ActionResult<{ photo: ReviewPhoto }>> {
  return run(async () => {
    const user = await requireUser();
    const file = form.get('photo');
    if (!(file instanceof File)) throw new DataError('invalid_input', 'photo', 'Choose a photo to add.');
    return { photo: await storeReviewPhoto(await db(), user.id, file) };
  });
}

export async function removeReview(productId: string, reviewId: string): Promise<ActionResult<object>> {
  return run(async () => {
    await requireUser();
    await reviews.deleteReview(await db(), reviewId);
    revalidatePath(`/product/${productId}`);
    return {};
  });
}

export async function toggleReviewHelpful(reviewId: string): Promise<ActionResult<reviews.HelpfulState>> {
  return run(async () => {
    await requireUser();
    return reviews.toggleHelpful(await db(), reviewId);
  });
}

export async function reportReview(reviewId: string, reason?: string): Promise<ActionResult<object>> {
  return run(async () => {
    await requireUser();
    await reviews.reportReview(await db(), reviewId, reason);
    return {};
  });
}

/**
 * The next reviews in `sort` order from `offset`, passing `filter` (`limit` lets a re-sort or a new
 * filter reload as many as it needs). `total` counts the filtered reviews.
 */
export async function loadMoreReviews(
  productId: string,
  offset: number,
  sort: reviews.ReviewSort = 'top',
  limit = 10,
  filter: reviews.ReviewFilter = {},
): Promise<ActionResult<{ items: Review[]; total: number }>> {
  return run(async () => {
    const user = await readUser();
    const page = await reviews.listReviews(await db(), productId, user?.id ?? null, {
      offset,
      limit,
      sort: reviews.readReviewSort(sort),
      filter: reviews.readReviewFilter(filter?.stars, filter?.verified),
    });
    return { items: page.items, total: page.total };
  });
}
