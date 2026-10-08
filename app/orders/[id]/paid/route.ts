import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { confirmPayNowCheckout } from '@/lib/data/payments';
import { DataError } from '@/lib/data/errors';

/**
 * Stripe's return trip after "Pay now" by card on a Pay on Delivery order. Only the session id is
 * taken from the URL: the session is fetched from Stripe server-side and the order switched to a
 * card order with a service-role call that checks it against the order. Safe to hit twice (a
 * refresh, or the webhook getting there first).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const market = await getMarket();
  const page = storePath({ id: market }, `/orders/${encodeURIComponent(id)}?placed=0`);
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) redirect(`${page}&error=payment_incomplete#pay-now`);

  let code: string | null = null;
  try {
    const order = await confirmPayNowCheckout(sessionId);
    if (order.id !== id) code = 'order_not_found';
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    console.error('[orders] pay now confirm failed', id, err.code, err.detail ?? '');
    code = err.code;
  }
  // paid for an order that couldn't take it any more: the card was refunded in full
  const refunded = code === 'order_not_payable' || code === 'amount_mismatch' ? '&refunded=1' : '';
  redirect(code ? `${page}&error=${encodeURIComponent(code)}${refunded}#pay-now` : `${page}&paid=1`);
}
