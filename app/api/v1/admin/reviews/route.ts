import { adminOnly } from '@/lib/api/admin';
import { intParam, json, preflight, route } from '@/lib/api/http';
import { listReviewQueue, queueView } from '@/lib/data/admin-reviews';

/**
 * GET /api/v1/admin/reviews?view=&page= — this store's review queue. view: reported (open
 * reports, most reported first; the default) | hidden (hidden by reports or an admin, newest
 * first). `counts` has both views' totals.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  const p = ctx.req.nextUrl.searchParams;
  return json(
    await listReviewQueue(ctx.db, ctx.market, {
      view: queueView(p.get('view')),
      page: intParam(p.get('page'), 1, 1, 10_000),
    }),
  );
});

export const OPTIONS = preflight;
