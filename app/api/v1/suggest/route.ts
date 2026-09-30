import { json, preflight, route } from '@/lib/api/http';
import { suggestSearch } from '@/lib/data/catalog';

/**
 * GET /api/v1/suggest?market=US&q=sony he
 * Search-as-you-type: completions of the last word, the top departments and a few products.
 */
export const GET = route(async (ctx) => {
  const q = ctx.req.nextUrl.searchParams.get('q') ?? '';
  return json({ market: ctx.market, q, ...(await suggestSearch(ctx.db, ctx.market, q)) });
});

export const OPTIONS = preflight;
