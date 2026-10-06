import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { listMyCases, openCase } from '@/lib/data/support';

/** GET /api/v1/me/support — the caller's support cases in this store: waiting or answered first, then closed. */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  return json({ cases: await listMyCases(ctx.db, ctx.market, user.id) });
});

/**
 * POST /api/v1/me/support { topic, subject, body, orderId? } — open a support case with its first
 * message. topic: order | delivery | return | payment | account | other. `201 {case}`; up to 5
 * cases waiting or answered per store (`409 too_many_cases`).
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const supportCase = await openCase(ctx.db, ctx.market, { topic: b.topic, subject: b.subject, body: b.body, orderId: b.orderId });
  return json({ case: supportCase }, { status: 201 });
});

export const OPTIONS = preflight;
