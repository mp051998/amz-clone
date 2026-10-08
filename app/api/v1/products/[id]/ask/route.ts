import { body, json, preflight, route } from '@/lib/api/http';
import { askProduct } from '@/lib/data/product-ask';

/**
 * POST /api/v1/products/:id/ask { question } — "Looking for specific info?": the question (3–150
 * characters) answered from the product's details, customer Q&A and reviews: `{question, answer,
 * snippets: [{kind: details|qa|review, text, question?, rating?}], terms, source}`. `answer` is an
 * AI answer from those passages (null with no AI provider, or when they don't answer it).
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  const input = await body(ctx.req);
  return json(await askProduct(ctx.db, ctx.market, id, input.question));
});

export const OPTIONS = preflight;
