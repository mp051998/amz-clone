import { json, preflight, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { listRechargePlans } from '@/lib/data/recharges';
import { isOperator, OPERATORS } from '@/lib/recharge';

/**
 * GET /api/v1/recharge-plans[?operator=Jio|Airtel|Vi|BSNL] — the prepaid plans mobile recharge
 * offers (amazon.in): `{plans: [{id, operator, amountMinor, validityDays?, data, calls?, sms?,
 * kind: "unlimited" | "data"}]}`, plans before data packs, cheapest first. Empty in stores
 * without mobile recharge.
 */
export const GET = route(async (ctx) => {
  const operator = ctx.req.nextUrl.searchParams.get('operator') || null;
  if (operator != null && !isOperator(operator)) throw new DataError('invalid_input', 'operator', `operator must be one of ${OPERATORS.join(', ')}.`);
  return json({ plans: await listRechargePlans(ctx.db, ctx.market, operator ?? undefined) });
});

export const OPTIONS = preflight;
