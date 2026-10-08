import { json, preflight, route } from '@/lib/api/http';
import { BILL_CATEGORIES, isBillCategory } from '@/lib/bills';
import { DataError } from '@/lib/data/errors';
import { listBillers } from '@/lib/data/bills';

/**
 * GET /api/v1/billers[?category=electricity|dth|broadband|gas|water|fastag] — who can be paid
 * with bill payments (amazon.in): `{billers: [{id, category, name, accountLabel, accountHint,
 * accountPattern, fetches, minMinor, maxMinor}]}`, by name. A biller that `fetches` sends a bill
 * (GET /billers/:id/bill), paid in full; the others take any whole-rupee amount from `minMinor`
 * to `maxMinor`. Empty in stores without bill payments.
 */
export const GET = route(async (ctx) => {
  const category = ctx.req.nextUrl.searchParams.get('category') || null;
  if (category != null && !isBillCategory(category)) {
    throw new DataError('invalid_input', 'category', `category must be one of ${BILL_CATEGORIES.join(', ')}.`);
  }
  return json({ billers: await listBillers(ctx.db, ctx.market, category ?? undefined) });
});

export const OPTIONS = preflight;
