import { body, noContent, preflight, route } from '@/lib/api/http';
import { recordSearch } from '@/lib/data/search-terms';

/**
 * POST /api/v1/searches — count a search that showed results, `{q}` as typed, for "Related
 * searches". `204`, also when nothing is counted (too short, too long, or it finds nothing here).
 */
export const POST = route(async (ctx) => {
  const input = await body(ctx.req);
  if (typeof input.q === 'string') await recordSearch(ctx.db, ctx.market, input.q);
  return noContent();
});

export const OPTIONS = preflight;
