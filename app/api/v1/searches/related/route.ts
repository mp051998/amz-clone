import { json, preflight, route } from '@/lib/api/http';
import { relatedSearches } from '@/lib/data/search-terms';

/**
 * GET /api/v1/searches/related?market=US&q=wireless earbuds
 * Other searches shoppers in this store made that share a word with `q` ("Related searches").
 */
export const GET = route(async (ctx) => {
  const q = ctx.req.nextUrl.searchParams.get('q') ?? '';
  return json({ market: ctx.market, q, related: await relatedSearches(ctx.db, ctx.market, q) });
});

export const OPTIONS = preflight;
