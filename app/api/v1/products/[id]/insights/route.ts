import { json, preflight, route } from '@/lib/api/http';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { getInsight } from '@/lib/data/insights';
import { decisionConfig } from '@/lib/decision/attributes';
import { deriveInsight } from '@/lib/decision/derive';
import { getProvider } from '@/lib/ai';
import { summarizeReviews } from '@/lib/ai/features/reviews';

/**
 * GET /api/v1/products/:id/insights[?summarize=1] — attribute scores (1..5),
 * pros/cons, best-for and the review summary. Falls back to a rules estimate
 * when nothing is stored. `summarize=1` refreshes the summary with the AI
 * provider when one is configured (cached; otherwise ignored).
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const product = await getProduct(ctx.db, id, { includeArchived: true });
  if (!product || product.market !== ctx.market) throw new DataError('product_not_found');
  let insight = await getInsight(ctx.db, id);
  if (ctx.req.nextUrl.searchParams.get('summarize') === '1' && getProvider()) {
    insight = (await summarizeReviews(id)) ?? insight;
  }
  if (!insight) {
    insight = { ...deriveInsight(product, decisionConfig(product.category), { pricePercentile: 0.5 }), updatedAt: new Date().toISOString() };
  }
  return json({ insight, attributes: decisionConfig(product.category).attributes.map(({ key, label, phrase }) => ({ key, label, phrase })) });
});

export const OPTIONS = preflight;
