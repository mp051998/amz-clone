'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import * as reviews from '@/lib/data/reviews';
import { DataError } from '@/lib/data/errors';
import type { Review } from '@/lib/types';

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
  input: { rating: number; title: string; body: string; authorName?: string },
): Promise<ActionResult<{ review: Review }>> {
  return run(async () => {
    const user = await requireUser();
    const review = await reviews.upsertReview(await db(), productId, user.id, input);
    revalidatePath(`/product/${productId}`);
    return { review };
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

/** The next reviews in `sort` order from `offset` (`limit` lets a re-sort reload as many as were showing). */
export async function loadMoreReviews(productId: string, offset: number, sort: reviews.ReviewSort = 'top', limit = 10): Promise<ActionResult<{ items: Review[]; total: number }>> {
  return run(async () => {
    const user = await readUser();
    const page = await reviews.listReviews(await db(), productId, user?.id ?? null, { offset, limit, sort: reviews.readReviewSort(sort) });
    return { items: page.items, total: page.total };
  });
}
