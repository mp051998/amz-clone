import { json, preflight, requireUser, route } from '@/lib/api/http';
import { listMyAnswers, listMyQuestions } from '@/lib/data/questions';

/** GET /api/v1/me/questions — the questions the caller asked and the answers they gave in this store, newest first. */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  const [questions, answers] = await Promise.all([listMyQuestions(ctx.db, ctx.market, user.id), listMyAnswers(ctx.db, ctx.market, user.id)]);
  return json({ questions, answers });
});

export const OPTIONS = preflight;
