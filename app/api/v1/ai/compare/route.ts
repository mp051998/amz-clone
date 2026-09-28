import { body, json, preflight, route } from '@/lib/api/http';
import { getProducts } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { getInsights } from '@/lib/data/insights';
import { clampWeights, decisionConfig, weightsFor } from '@/lib/decision/attributes';
import { rankProducts } from '@/lib/decision/rank';
import { compareTable } from '@/lib/decision/verdict';
import { compareVerdictAI } from '@/lib/ai/features/compare';

/**
 * POST /api/v1/ai/compare { productIds: [2..4], weights?, use? } — ranked products
 * (input order), a verdict and the "What's different" / "Same on all" table.
 */
export const POST = route(async (ctx) => {
  const b = await body(ctx.req);
  const ids = Array.isArray(b.productIds) ? [...new Set(b.productIds.filter((x): x is string => typeof x === 'string'))] : [];
  if (ids.length < 2 || ids.length > 4) throw new DataError('invalid_input', 'productIds', 'Compare 2 to 4 products.');
  const products = (await getProducts(ctx.db, ids)).filter((p) => p.market === ctx.market);
  if (products.length !== ids.length) throw new DataError('product_not_found');
  const category = products[0].category;
  const cfg = decisionConfig(category);
  const weights =
    b.weights && typeof b.weights === 'object'
      ? clampWeights(category, b.weights as Record<string, unknown>)
      : weightsFor(category, typeof b.use === 'string' ? b.use : null);
  const insights = await getInsights(ctx.db, ids);
  const order = new Map(ids.map((id, i) => [id, i]));
  const ranked = rankProducts(products, insights, weights, { config: cfg }).sort(
    (x, y) => order.get(x.product.id)! - order.get(y.product.id)!,
  );
  const verdict = await compareVerdictAI(ranked, weights, cfg);
  return json({ weights, ranked, verdict, table: compareTable(ranked, cfg) });
});

export const OPTIONS = preflight;
