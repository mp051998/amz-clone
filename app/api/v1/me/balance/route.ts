import { json, preflight, requireUser, route } from '@/lib/api/http';
import { balanceHistory, storeBalance } from '@/lib/data/balance';

/** GET /api/v1/me/balance — the caller's gift card balance in this store and its latest changes. */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const [balanceMinor, history] = await Promise.all([storeBalance(ctx.db, ctx.market), balanceHistory(ctx.db, ctx.market, 50)]);
  return json({ balanceMinor: balanceMinor ?? 0, history });
});

export const OPTIONS = preflight;
