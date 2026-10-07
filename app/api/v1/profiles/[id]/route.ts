import { intParam, json, preflight, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { reviewerProfile } from '@/lib/data/reviews';

/**
 * GET /api/v1/profiles/:id?page= — a reviewer's public profile in this store (`authorId` on a
 * review): their name, review count, helpful votes, and their visible reviews, newest first, 10 a
 * page with each product.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const page = intParam(ctx.req.nextUrl.searchParams.get('page'), 1, 1, 1000);
  const profile = await reviewerProfile(ctx.db, ctx.market, id, page);
  if (!profile) throw new DataError('not_found', 'profile', 'There’s no profile with reviews here.');
  return json({ profile });
});

export const OPTIONS = preflight;
