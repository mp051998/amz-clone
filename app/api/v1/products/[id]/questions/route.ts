import { body, intParam, json, preflight, requireUser, route } from '@/lib/api/http';
import { askQuestion, listQuestions } from '@/lib/data/questions';

/**
 * GET /api/v1/products/:id/questions?q=&limit=10&offset=0 — the product's questions, most answered
 * first, each with its answers (most helpful first). `q` keeps questions whose text, or an answer, contains it.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const sp = ctx.req.nextUrl.searchParams;
  const page = await listQuestions(ctx.db, id, ctx.user?.id ?? null, {
    q: sp.get('q') ?? '',
    limit: intParam(sp.get('limit'), 10, 1, 50),
    offset: intParam(sp.get('offset'), 0, 0, 100_000),
  });
  return json(page);
});

/** POST /api/v1/products/:id/questions { body } — ask a question (10–300 characters) about a product on sale. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  const user = requireUser(ctx);
  const input = await body(ctx.req);
  const question = await askQuestion(ctx.db, id, user.id, typeof input.body === 'string' ? input.body : '');
  return json({ question }, { status: 201 });
});

export const OPTIONS = preflight;
