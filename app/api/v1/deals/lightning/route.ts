import { json, preflight, route } from '@/lib/api/http';
import { getProducts } from '@/lib/data/catalog';
import { watchedDeals } from '@/lib/data/deal-watches';
import { lightningDeals } from '@/lib/data/lightning-deals';

/**
 * GET /api/v1/deals/lightning — this store's Lightning Deals: `live` (ending soonest first) and
 * `upcoming` (starting within a day, soonest first), each `{deal, product}`. A live deal's product
 * already carries the deal price. `watching` has the ids of the upcoming ones the caller watches
 * (empty signed out).
 */
export const GET = route(async (ctx) => {
  const { live, upcoming } = await lightningDeals(ctx.db, ctx.market);
  const products = new Map((await getProducts(ctx.db, [...live, ...upcoming].map((d) => d.productId))).map((p) => [p.id, p]));
  const withProduct = (deals: typeof live) => deals.flatMap((deal) => (products.has(deal.productId) ? [{ deal, product: products.get(deal.productId)! }] : []));
  const watching = ctx.user ? await watchedDeals(ctx.db, upcoming.map((d) => d.id)) : new Set<string>();
  return json({ market: ctx.market, live: withProduct(live), upcoming: withProduct(upcoming), watching: [...watching] });
});

export const OPTIONS = preflight;
