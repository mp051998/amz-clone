import { json, preflight, route } from '@/lib/api/http';
import { buyAgain } from '@/lib/data/buy-again';
import { getProducts } from '@/lib/data/catalog';
import { recommendations } from '@/lib/data/recommendations';
import { parseIds, RECENT_MAX, RECS_SKIP_MAX } from '@/lib/recent-ids';

/** Past purchases recommendations can start from, as on the web page. */
const BOUGHT_SCAN = 20;

/**
 * GET /api/v1/recommendations?recent=&skip= — "Your Recommendations": rows of what shoppers viewed
 * with the device's latest views (`recent`, newest first, its browsing history) and, signed in,
 * what buyers bought with the caller's latest purchases, leaving out the products in `skip`
 * ("Don't use for recommendations"). Both are comma-separated ids; anything else in them is ignored.
 */
export const GET = route(async (ctx) => {
  const qs = ctx.req.nextUrl.searchParams;
  const [viewed, purchases] = await Promise.all([
    getProducts(ctx.db, parseIds(qs.get('recent'), RECENT_MAX)),
    ctx.user ? buyAgain(ctx.db, ctx.market, BOUGHT_SCAN) : Promise.resolve([]),
  ]);
  const groups = await recommendations(ctx.db, ctx.market, {
    viewed: viewed.filter((p) => p.market === ctx.market),
    bought: purchases.flatMap((x) => (x.product ? [x.product] : [])),
    skip: new Set(parseIds(qs.get('skip'), RECS_SKIP_MAX)),
  });
  return json({ groups });
});

export const OPTIONS = preflight;
