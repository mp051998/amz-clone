import { adminOnly } from '@/lib/api/admin';
import { intParam, json, preflight, route } from '@/lib/api/http';
import { claimFilter, listClaimQueue } from '@/lib/data/atoz-claims';

/**
 * GET /api/v1/admin/claims?filter=&page= — this store's A-to-z Guarantee claims, each with the
 * seller's items in the order. filter: open (under review, oldest first; the default) | decided
 * (granted or denied) | all. `counts` has every filter's total.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  const p = ctx.req.nextUrl.searchParams;
  return json(
    await listClaimQueue(ctx.db, ctx.market, {
      filter: claimFilter(p.get('filter')),
      page: intParam(p.get('page'), 1, 1, 10_000),
    }),
  );
});

export const OPTIONS = preflight;
