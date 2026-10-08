import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { BILL_CATEGORIES, isBillCategory, isBillMethod } from '@/lib/bills';
import { DataError } from '@/lib/data/errors';
import { listBillPayments, payBill } from '@/lib/data/bills';

/** GET /api/v1/me/bill-payments[?category=] — the caller's bill payments in the store, newest first. */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const category = ctx.req.nextUrl.searchParams.get('category') || null;
  if (category != null && !isBillCategory(category)) {
    throw new DataError('invalid_input', 'category', `category must be one of ${BILL_CATEGORIES.join(', ')}.`);
  }
  return json({ payments: await listBillPayments(ctx.db, ctx.market, { ...(category ? { category } : {}), limit: 50 }) });
});

/**
 * POST /api/v1/me/bill-payments `{ billerId, account, amountMinor, method: "amazonpay" | "upi" |
 * "netbanking", bank? }` — pay a biller (GET /billers; a demo: nothing is paid or charged), 201
 * with the payment. A biller that sends bills is paid this month's bill in full (GET
 * /billers/:id/bill): `409 bill_paid` once it's paid, `409 amount_mismatch` when `amountMinor`
 * isn't the bill's. Otherwise `amountMinor` is whole rupees within the biller's limits.
 * "amazonpay" pays from the store balance (`409 insufficient_balance` when it doesn't cover it).
 * `422 invalid_input` (detail biller | account | amount | method).
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const input = await body(ctx.req);
  if (typeof input.billerId !== 'string' || !input.billerId) throw new DataError('invalid_input', 'biller', 'Send billerId: one of GET /billers.');
  if (typeof input.account !== 'string' || !input.account.trim()) throw new DataError('invalid_input', 'account', 'Send account: the account with the biller.');
  if (!Number.isSafeInteger(input.amountMinor) || (input.amountMinor as number) <= 0) {
    throw new DataError('invalid_input', 'amount', 'Send amountMinor: the amount in minor units (paise).');
  }
  if (!isBillMethod(input.method)) throw new DataError('invalid_input', 'method', 'Send method: "amazonpay", "upi" or "netbanking".');
  const bank = typeof input.bank === 'string' && input.bank.trim() ? input.bank.trim().slice(0, 60) : undefined;
  const payment = await payBill(ctx.db, {
    billerId: input.billerId,
    account: input.account,
    amountMinor: input.amountMinor as number,
    method: input.method,
    ...(bank ? { bank } : {}),
  });
  return json({ payment }, { status: 201 });
});

export const OPTIONS = preflight;
