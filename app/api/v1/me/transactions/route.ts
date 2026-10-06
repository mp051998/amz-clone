import { json, preflight, requireUser, route } from '@/lib/api/http';
import { listTransactions } from '@/lib/data/transactions';

/** GET /api/v1/me/transactions — the caller's charges and refunds in this store, newest first. */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  return json({ transactions: await listTransactions(ctx.db, ctx.market, user.id) });
});

export const OPTIONS = preflight;
