import { json, preflight, requireUser, route } from '@/lib/api/http';
import { listInbox } from '@/lib/data/inbox';
import { MARKETS } from '@/lib/marketplace';

/**
 * GET /api/v1/me/messages — the caller's updates in this store from the last 90 days, newest
 * first: order milestones, refunds, returns, the store's replies on support cases and answers to
 * their questions.
 */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  return json({ messages: await listInbox(ctx.db, ctx.market, user.id, new Date(), MARKETS[ctx.market].dates.timeZone) });
});

export const OPTIONS = preflight;
