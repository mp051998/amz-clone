import { adminOnly } from '@/lib/api/admin';
import { intParam, json, preflight, route } from '@/lib/api/http';
import { listQuestionQueue, questionView } from '@/lib/data/admin-questions';

/**
 * GET /api/v1/admin/questions?view=&page= — this store's product questions, newest first, with
 * their answers. view: unanswered (the default) | all. `counts` has both views' totals.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  const p = ctx.req.nextUrl.searchParams;
  return json(
    await listQuestionQueue(ctx.db, ctx.market, {
      view: questionView(p.get('view')),
      page: intParam(p.get('page'), 1, 1, 10_000),
    }),
  );
});

export const OPTIONS = preflight;
