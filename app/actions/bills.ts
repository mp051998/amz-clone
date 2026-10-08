'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { payBill } from '@/lib/data/bills';
import { DataError } from '@/lib/data/errors';
import { getMarket } from '@/lib/session';
import { signInPath, storePath } from '@/lib/marketplace';
import { CHECKOUT_BANKS } from '@/lib/bank-offers';
import { billAccount, isBillCategory, isBillMethod, rupeesMinor } from '@/lib/bills';

/** A category's bills page for this biller and account, with `extra` (an error, the amount typed, or `done`). */
function back(category: string, fields: { biller: string; account: string }, extra: Record<string, string>, hash = '') {
  const q = new URLSearchParams({ ...fields, ...extra });
  return `/amazon-pay/bills/${category}?${q.toString()}${hash}`;
}

/**
 * Pay a biller: `category`, `biller`, `account`, the amount — `bill` (minor units: the fetched
 * bill, paid in full) or `amount` (whole rupees, for a biller the shopper chooses the amount for)
 * — and `method` (amazonpay — the balance —, upi or netbanking, with `bank`). A field that isn't
 * valid comes back as `?error=<field>#pay`; a balance that doesn't cover it as `error=balance`,
 * a bill already paid as `error=paid`, a bill that's changed as `error=changed`; done, it's
 * `?done=<payment id>`.
 */
export async function payBillAction(formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  const category = String(formData.get('category') ?? '');
  if (!isBillCategory(category)) redirect(sp('/amazon-pay'));
  const fields = { biller: String(formData.get('biller') ?? ''), account: billAccount(formData.get('account')) };
  if (!(await readUser())) redirect(signInPath({ id: market }, back(category, fields, {})));
  const typed = formData.get('amount');
  const amountMinor = typed != null ? rupeesMinor(typed) : Number(formData.get('bill'));
  const kept: Record<string, string> = typed != null ? { amount: String(typed).trim().slice(0, 12) } : {};
  const method = formData.get('method');
  const bank = String(formData.get('bank') ?? '');
  const fail = (error: string) => redirect(sp(back(category, fields, { ...kept, error }, '#pay')));
  if (!fields.biller) fail('biller');
  if (!fields.account) fail('account');
  if (!amountMinor || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) fail('amount');
  if (!isBillMethod(method)) fail('method');
  let id = '';
  try {
    const done = await payBill(await db(), {
      billerId: fields.biller,
      account: fields.account,
      amountMinor: amountMinor!,
      method: method as Parameters<typeof payBill>[1]['method'],
      ...(method === 'netbanking' && (CHECKOUT_BANKS as readonly string[]).includes(bank) ? { bank } : {}),
    });
    id = done.id;
  } catch (err) {
    if (err instanceof DataError && err.code === 'insufficient_balance') fail('balance');
    if (err instanceof DataError && err.code === 'bill_paid') fail('paid');
    if (err instanceof DataError && err.code === 'amount_mismatch') fail('changed');
    if (err instanceof DataError && err.code === 'invalid_input') {
      fail(err.detail === 'biller' || err.detail === 'account' || err.detail === 'method' ? err.detail : 'amount');
    }
    throw err;
  }
  // the balance changed when it paid
  revalidatePath('/', 'layout');
  redirect(sp(back(category, fields, { done: id })));
}
