import { json, preflight, requireUser, route } from '@/lib/api/http';
import { getProducts } from '@/lib/data/catalog';
import { myWatchedDeals } from '@/lib/data/deal-watches';

/**
 * GET /api/v1/deals/lightning/watched — "Watched deals": the caller's watched Lightning Deals in
 * this store that haven't ended, each `{deal, product}`: live ones first (ending soonest), then
 * upcoming (starting soonest), then any all claimed before their end.
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const deals = await myWatchedDeals(ctx.db, ctx.market);
  const products = new Map((await getProducts(ctx.db, deals.map((d) => d.productId))).map((p) => [p.id, p]));
  return json({ deals: deals.flatMap((deal) => (products.has(deal.productId) ? [{ deal, product: products.get(deal.productId)! }] : [])) });
});

export const OPTIONS = preflight;
