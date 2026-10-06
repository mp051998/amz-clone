import { json, preflight, requireUser, route } from '@/lib/api/http';
import { claimDemoGiftCard } from '@/lib/data/balance';

/** POST /api/v1/me/balance/demo-card — the caller's demo gift card for this store (issued once). */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  return json({ giftCard: await claimDemoGiftCard(ctx.db, ctx.market) });
});

export const OPTIONS = preflight;
