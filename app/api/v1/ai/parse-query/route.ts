import { body, json, preflight, route } from '@/lib/api/http';
import { listCategories } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { parseSearchQuery } from '@/lib/ai/features/parseQuery';

/** POST /api/v1/ai/parse-query { q } — keywords, category, budget, use, chips and headline. */
export const POST = route(async (ctx) => {
  const b = await body(ctx.req);
  if (typeof b.q !== 'string') throw new DataError('invalid_input', 'q');
  const query = await parseSearchQuery(ctx.market, b.q.slice(0, 200), await listCategories(ctx.db, ctx.market));
  return json({ query });
});

export const OPTIONS = preflight;
