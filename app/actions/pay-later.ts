'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { activatePayLater, isRepayMethod, payLater, repayPayLater } from '@/lib/data/pay-later';
import { DataError } from '@/lib/data/errors';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { CHECKOUT_BANKS } from '@/lib/bank-offers';

const PAGE = '/amazon-pay/later';

async function signedIn() {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (!(await readUser())) redirect(sp(`/signin?next=${PAGE}`));
  return { market, sp };
}

/** Activate Pay Later (instant, in this demo) and come back to the account. */
export async function activatePayLaterAction(): Promise<void> {
  const { market, sp } = await signedIn();
  try {
    await activatePayLater(await db(), market);
  } catch (err) {
    if (err instanceof DataError && err.code === 'pay_later_unavailable') redirect(sp(PAGE));
    throw err;
  }
  // checkout offers it now
  revalidatePath('/', 'layout');
  redirect(sp(`${PAGE}?activated=1`));
}

/**
 * Repay what's owed: `amount` is `bill` (the latest bill), `all` (everything owed) or `other`
 * (then `other` is the amount, in the currency's major units); `method` is upi or netbanking (with
 * `bank`). An amount that's nothing or more than what's owed comes back as `?error=amount`.
 */
export async function repayPayLaterAction(formData: FormData): Promise<void> {
  const { sp } = await signedIn();
  const client = await db();
  const account = await payLater(client);
  if (!account) redirect(sp(PAGE));
  const choice = String(formData.get('amount') ?? '');
  const other = Number(String(formData.get('other') ?? '').replace(/[,\s]/g, ''));
  const amountMinor =
    choice === 'bill' ? account.billMinor
    : choice === 'all' ? account.usedMinor
    : choice === 'other' && Number.isFinite(other) ? Math.round(other * 100)
    : 0;
  const method = formData.get('method');
  const bank = String(formData.get('bank') ?? '');
  if (!isRepayMethod(method)) redirect(sp(`${PAGE}?error=method#repay`));
  if (amountMinor <= 0 || amountMinor > account.usedMinor) redirect(sp(`${PAGE}?error=amount#repay`));
  try {
    await repayPayLater(client, amountMinor, method, method === 'netbanking' && (CHECKOUT_BANKS as readonly string[]).includes(bank) ? bank : undefined);
  } catch (err) {
    if (err instanceof DataError && err.code === 'invalid_input') redirect(sp(`${PAGE}?error=${err.detail === 'method' ? 'method' : 'amount'}#repay`));
    throw err;
  }
  // checkout's available limit changes
  revalidatePath('/', 'layout');
  redirect(sp(`${PAGE}?repaid=${amountMinor}`));
}
