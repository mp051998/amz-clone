import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { answerQuestion } from '@/lib/data/questions';

/**
 * POST /api/v1/questions/:id/answers { body } — answer a question (2–1000 characters, one answer per
 * shopper). `verified` is set by the database when the caller has a placed order containing the product.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  const user = requireUser(ctx);
  const input = await body(ctx.req);
  const answer = await answerQuestion(ctx.db, id, user.id, typeof input.body === 'string' ? input.body : '');
  return json({ answer }, { status: 201 });
});

export const OPTIONS = preflight;
