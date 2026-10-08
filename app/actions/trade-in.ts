'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { cancelTradeIn, requestTradeIn } from '@/lib/data/trade-ins';
import { DataError } from '@/lib/data/errors';
import { isExchangeCondition } from '@/lib/exchange';
import { getMarket } from '@/lib/session';
import { signInPath, storePath } from '@/lib/marketplace';
import { hasTradeIn } from '@/lib/trade-in';

const PAGE = '/trade-in';

/**
 * Trade in the quoted device: `device` and `condition`. A field that isn't valid comes back as
 * `?error=<field>`, five already waiting as `?error=limit`; done, it's `?done=<trade-in id>#yours`.
 */
export async function requestTradeInAction(formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (!hasTradeIn(market)) redirect(sp('/'));
  const device = String(formData.get('device') ?? '').trim().slice(0, 60);
  const condition = formData.get('condition');
  const quote = new URLSearchParams({ ...(device ? { device } : {}), ...(isExchangeCondition(condition) ? { condition } : {}) });
  if (!(await readUser())) redirect(signInPath({ id: market }, `${PAGE}?${quote.toString()}#quote`));
  const fail = (error: string) => redirect(sp(`${PAGE}?${new URLSearchParams({ ...Object.fromEntries(quote), error }).toString()}#quote`));
  if (!device) fail('device');
  if (!isExchangeCondition(condition)) fail('condition');
  let id = '';
  try {
    id = (await requestTradeIn(await db(), device, condition as 'good' | 'screen_damaged')).id;
  } catch (err) {
    if (err instanceof DataError && err.code === 'invalid_input') fail(err.detail === 'condition' ? 'condition' : 'device');
    if (err instanceof DataError && err.code === 'trade_in_limit') fail('limit');
    throw err;
  }
  revalidatePath(PAGE);
  redirect(sp(`${PAGE}?done=${encodeURIComponent(id)}#yours`));
}

/** Cancel one of the caller's trade-ins before it's sent (bound to its id): `?cancelled=1#yours`, or `?error=closed#yours`. */
export async function cancelTradeInAction(id: string): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (!(await readUser())) redirect(signInPath({ id: market }, PAGE));
  try {
    await cancelTradeIn(await db(), String(id));
  } catch (err) {
    if (err instanceof DataError && (err.code === 'trade_in_closed' || err.code === 'trade_in_not_found' || err.code === 'invalid_input')) {
      redirect(sp(`${PAGE}?error=closed#yours`));
    }
    throw err;
  }
  revalidatePath(PAGE);
  redirect(sp(`${PAGE}?cancelled=1#yours`));
}
