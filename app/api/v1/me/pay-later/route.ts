import { json, preflight, requireUser, route } from '@/lib/api/http';
import { activatePayLater, payLater } from '@/lib/data/pay-later';

/**
 * GET /api/v1/me/pay-later — the caller's Pay Later account (amazon.in), or null before they
 * activate it: { payLater: { market, activatedAt, limitMinor, usedMinor, creditMinor,
 * availableMinor, billMinor, unbilledMinor, dueOn?, overdue } | null }. The bill is made on the
 * 1st (store time) for what was bought before then, and due on the 5th.
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  return json({ payLater: await payLater(ctx.db) });
});

/**
 * POST /api/v1/me/pay-later — activate Pay Later in the store (a demo: instant, no credit check),
 * with the store's limit. `422 pay_later_unavailable` in a store that doesn't offer it (amazon.com).
 * Activating again is a no-op. Then `paylater` is a payment method at checkout.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  return json({ payLater: await activatePayLater(ctx.db, ctx.market) });
});

export const OPTIONS = preflight;
