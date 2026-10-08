import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { listRecharges, rechargeMobile } from '@/lib/data/recharges';
import { isRechargeMethod, mobileNumber } from '@/lib/recharge';

/** GET /api/v1/me/recharges — the caller's mobile recharges in the store, newest first. */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  return json({ recharges: await listRecharges(ctx.db, ctx.market, 50) });
});

/**
 * POST /api/v1/me/recharges `{ number, circle, planId, method: "amazonpay" | "upi" | "netbanking",
 * bank? }` — recharge a prepaid number with a plan (GET /recharge-plans; a demo: nothing is
 * recharged or charged), 201 with the recharge. "amazonpay" pays from the store balance; the
 * cashback goes into it at once. `422 invalid_input` (detail number | circle | plan | method);
 * `409 insufficient_balance` when the balance pays and doesn't cover it.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const input = await body(ctx.req);
  const number = mobileNumber(input.number);
  if (!number) throw new DataError('invalid_input', 'number', 'Send number: a 10-digit Indian mobile number.');
  if (typeof input.circle !== 'string' || !input.circle) throw new DataError('invalid_input', 'circle', 'Send circle: the number’s telecom circle.');
  if (typeof input.planId !== 'string' || !input.planId) throw new DataError('invalid_input', 'plan', 'Send planId: one of GET /recharge-plans.');
  if (!isRechargeMethod(input.method)) throw new DataError('invalid_input', 'method', 'Send method: "amazonpay", "upi" or "netbanking".');
  const bank = typeof input.bank === 'string' && input.bank.trim() ? input.bank.trim().slice(0, 60) : undefined;
  const recharge = await rechargeMobile(ctx.db, { number, circle: input.circle, planId: input.planId, method: input.method, ...(bank ? { bank } : {}) });
  return json({ recharge }, { status: 201 });
});

export const OPTIONS = preflight;
