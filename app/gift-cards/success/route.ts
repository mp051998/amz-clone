import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { confirmGiftCardCheckout } from '@/lib/data/payments';
import { DataError } from '@/lib/data/errors';
import type { GiftCardPurchase } from '@/lib/data/gift-card-purchases';

/**
 * Stripe Checkout return trip for a gift card or a balance reload (`for=reload`). Only the session
 * id is taken from the URL: the session is fetched from Stripe server-side, and the service-role
 * confirm checks the amount and currency before issuing the code or crediting the balance. Safe to
 * hit twice (a refresh, or the webhook getting there first).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  const reload = req.nextUrl.searchParams.get('for') === 'reload';
  const failed = (code: string) => sp(reload ? `/gift-cards?error=${code}&for=reload#balance` : `/gift-cards?error=${code}#buy`);
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) redirect(failed('payment_incomplete'));

  let purchase: GiftCardPurchase | null = null;
  let code = 'internal';
  try {
    purchase = await confirmGiftCardCheckout(sessionId);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    console.error('[gift-cards] confirm failed', err.code, err.detail ?? '');
    code = err.code;
  }
  if (!purchase) redirect(failed(code));
  revalidatePath('/', 'layout');
  const id = encodeURIComponent(purchase.id);
  redirect(sp(purchase.reload ? `/gift-cards?reloaded=${id}#balance` : `/gift-cards?bought=${id}#purchases`));
}
