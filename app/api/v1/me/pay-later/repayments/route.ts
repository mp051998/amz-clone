import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { isRepayMethod, listPayLaterRepayments, repayPayLater } from '@/lib/data/pay-later';

/** GET /api/v1/me/pay-later/repayments — the caller's Pay Later repayments, newest first. */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  return json({ repayments: await listPayLaterRepayments(ctx.db) });
});

/**
 * POST /api/v1/me/pay-later/repayments `{ amountMinor, method: "upi" | "netbanking", bank? }` —
 * repay some or all of what's owed (a demo: nothing is taken), 201 with the account. `422
 * invalid_input` (detail amountMinor | method | amount: more than what's owed); `409
 * pay_later_inactive` before activating.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const input = await body(ctx.req);
  if (!Number.isInteger(input.amountMinor) || (input.amountMinor as number) <= 0) {
    throw new DataError('invalid_input', 'amountMinor', 'Send amountMinor: a whole number of minor units, more than 0.');
  }
  if (!isRepayMethod(input.method)) throw new DataError('invalid_input', 'method', 'Send method: "upi" or "netbanking".');
  const bank = typeof input.bank === 'string' && input.bank.trim() ? input.bank.trim().slice(0, 60) : undefined;
  return json({ payLater: await repayPayLater(ctx.db, input.amountMinor as number, input.method, bank) }, { status: 201 });
});

export const OPTIONS = preflight;
