import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { listMyCases, openCase, unreadCaseIds } from '@/lib/data/support';

/**
 * GET /api/v1/me/support — the caller's support cases in this store: waiting or answered first, then
 * closed. `newReply` marks cases the store has written on since the caller last opened them.
 */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  const [cases, unread] = await Promise.all([listMyCases(ctx.db, ctx.market, user.id), unreadCaseIds(ctx.db, ctx.market)]);
  return json({ cases: cases.map((c) => ({ ...c, newReply: unread.has(c.id) })) });
});

/**
 * POST /api/v1/me/support { topic, subject, body, orderId?, seller? } — open a support case with its
 * first message. topic: order | delivery | return | payment | account | other. With `seller`, the
 * case goes to that seller ("Contact seller"; `404 seller_not_found` if they sell nothing in this
 * store), and `orderId` must have their items in it. `201 {case}`; up to 5 cases waiting or
 * answered per store (`409 too_many_cases`).
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const supportCase = await openCase(ctx.db, ctx.market, { topic: b.topic, subject: b.subject, body: b.body, orderId: b.orderId, seller: b.seller });
  return json({ case: supportCase }, { status: 201 });
});

export const OPTIONS = preflight;
