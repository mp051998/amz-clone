import { json, preflight, requireUser, route } from '@/lib/api/http';
import { inboxSeenAt, isNewMessage, listInbox, markInboxSeen } from '@/lib/data/inbox';
import { MARKETS } from '@/lib/marketplace';

/**
 * GET /api/v1/me/messages — the caller's updates in this store from the last 90 days, newest
 * first: order milestones, refunds, returns, the store's replies on support cases and answers to
 * their questions. Each says whether it came in since they last looked; reading them marks them seen.
 */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  const [list, seenAt] = await Promise.all([
    listInbox(ctx.db, ctx.market, user.id, new Date(), MARKETS[ctx.market].dates.timeZone),
    inboxSeenAt(ctx.db, ctx.market),
  ]);
  await markInboxSeen(ctx.db, ctx.market);
  return json({ messages: list.map((m) => ({ ...m, new: isNewMessage(m, seenAt) })), seenAt });
});

export const OPTIONS = preflight;
