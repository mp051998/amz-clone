'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { rechargeMobile } from '@/lib/data/recharges';
import { DataError } from '@/lib/data/errors';
import { getMarket } from '@/lib/session';
import { signInPath, storePath } from '@/lib/marketplace';
import { CHECKOUT_BANKS } from '@/lib/bank-offers';
import { isCircle, isOperator, isRechargeMethod, mobileNumber } from '@/lib/recharge';

const PAGE = '/amazon-pay/recharge';

/** The page again for this number, operator and circle, with `extra` (an error, or `done`). */
function back(fields: { number: string; operator: string; circle: string }, extra: Record<string, string>, hash = '') {
  const q = new URLSearchParams({ ...fields, ...extra });
  return `${PAGE}?${q.toString()}${hash}`;
}

/**
 * Recharge a prepaid number with one of its operator's plans: `number`, `operator`, `circle`,
 * `plan`, and `method` (amazonpay — the balance —, upi or netbanking, with `bank`). A field that
 * isn't valid comes back as `?error=<field>#pay`, a balance that doesn't cover it as
 * `?error=balance#pay`; done, it's `?done=<recharge id>`.
 */
export async function rechargeAction(formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  const raw = String(formData.get('number') ?? '');
  const number = mobileNumber(raw);
  const operator = String(formData.get('operator') ?? '');
  const circle = String(formData.get('circle') ?? '');
  const fields = { number: number ?? raw.trim(), operator, circle };
  if (!(await readUser())) redirect(signInPath({ id: market }, back(fields, {})));
  const plan = String(formData.get('plan') ?? '');
  const method = formData.get('method');
  const bank = String(formData.get('bank') ?? '');
  const fail = (error: string) => redirect(sp(back(fields, { error }, '#pay')));
  if (!number) fail('number');
  if (!isOperator(operator)) fail('operator');
  if (!isCircle(circle)) fail('circle');
  if (!plan) fail('plan');
  if (!isRechargeMethod(method)) fail('method');
  let id = '';
  try {
    const done = await rechargeMobile(await db(), {
      number: number!,
      circle,
      planId: plan,
      method: method as Parameters<typeof rechargeMobile>[1]['method'],
      ...(method === 'netbanking' && (CHECKOUT_BANKS as readonly string[]).includes(bank) ? { bank } : {}),
    });
    id = done.id;
  } catch (err) {
    if (err instanceof DataError && err.code === 'insufficient_balance') fail('balance');
    if (err instanceof DataError && err.code === 'invalid_input') fail(err.detail === 'number' || err.detail === 'circle' || err.detail === 'method' ? err.detail : 'plan');
    throw err;
  }
  // the balance (paid from it, and the cashback) changed
  revalidatePath('/', 'layout');
  redirect(sp(back(fields, { done: id })));
}
