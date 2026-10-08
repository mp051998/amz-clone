import { json, preflight, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { fetchBill } from '@/lib/data/bills';

/**
 * GET /api/v1/billers/:id/bill?account= — this month's bill for an account with a biller that
 * sends bills: `{bill: {billerId, account, period, amountMinor, dueOn, overdue, paid?: {id,
 * amountMinor, at}}}` (`paid`: the caller's payment of it, signed in). `422 invalid_input`, detail
 * biller | account, for a biller that doesn't send bills or an account that isn't one of its.
 */
export const GET = route<{ id: string }>(async (ctx, params) => {
  const account = ctx.req.nextUrl.searchParams.get('account');
  if (!account) throw new DataError('invalid_input', 'account', 'Send account: the account with the biller.');
  return json({ bill: await fetchBill(ctx.db, params.id, account) });
});

export const OPTIONS = preflight;
