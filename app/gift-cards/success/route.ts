import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { confirmGiftCardCheckout } from '@/lib/data/payments';
import { DataError } from '@/lib/data/errors';

/**
 * Stripe Checkout return trip for a gift card. Only the session id is taken from the URL: the
 * session is fetched from Stripe server-side, and the service-role confirm checks the amount and
 * currency before issuing the code. Safe to hit twice (a refresh, or the webhook getting there first).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) redirect(sp('/gift-cards?error=payment_incomplete#buy'));

  let purchaseId: string | null = null;
  let code = 'internal';
  try {
    purchaseId = (await confirmGiftCardCheckout(sessionId)).id;
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    console.error('[gift-cards] confirm failed', err.code, err.detail ?? '');
    code = err.code;
  }
  if (purchaseId) revalidatePath('/gift-cards');
  redirect(purchaseId ? sp(`/gift-cards?bought=${encodeURIComponent(purchaseId)}#purchases`) : sp(`/gift-cards?error=${code}#buy`));
}
