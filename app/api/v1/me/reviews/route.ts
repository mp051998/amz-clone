import { json, preflight, requireUser, route } from '@/lib/api/http';
import { awaitingReview, listMyReviews } from '@/lib/data/reviews';

/**
 * GET /api/v1/me/reviews — the caller's reviews in this store (newest first, with their products) and
 * what's waiting for one: products from delivered orders they haven't reviewed yet.
 */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  const [reviews, awaiting] = await Promise.all([listMyReviews(ctx.db, ctx.market, user.id), awaitingReview(ctx.db, ctx.market, user.id)]);
  return json({ reviews, awaiting });
});

export const OPTIONS = preflight;
