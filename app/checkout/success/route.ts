import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { confirmCheckoutSession } from '@/lib/data/payments';
import { DataError } from '@/lib/data/errors';

/**
 * Stripe Checkout return trip. Only the session id is taken from the URL: the
 * session is fetched from Stripe server-side and the order is confirmed with a
 * service-role call that checks amount and currency against the order. Safe to
 * hit twice (a refresh, or the webhook getting there first).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) redirect(sp('/checkout?error=payment_incomplete'));

  let orderId: string | null = null;
  let code = 'internal';
  try {
    orderId = (await confirmCheckoutSession(sessionId)).id;
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    console.error('[checkout] confirm failed', err.code, err.detail ?? '');
    code = err.code;
  }
  redirect(orderId ? sp(`/orders/${orderId}?placed=1`) : sp(`/checkout?error=${code}`));
}
