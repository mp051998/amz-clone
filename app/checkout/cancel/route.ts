import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/supabase/server';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { cancelPendingOrder } from '@/lib/data/orders';
import { buyNowQuery, readBuyNow } from '@/lib/buy-now';

/** Back from Stripe without paying: cancel the pending order (releases stock), keep the cart. Buy Now returns to its own checkout. */
export async function GET(req: NextRequest): Promise<Response> {
  const market = await getMarket();
  const q = req.nextUrl.searchParams;
  const orderId = q.get('order');
  if (orderId) await cancelPendingOrder(await db(), orderId).catch(() => undefined);
  const buy = readBuyNow(q.get('buy'), q.get('qty'), q.get('protection'), q.get('size'));
  redirect(storePath({ id: market }, `/checkout?canceled=1${buy ? `&${buyNowQuery(buy)}` : ''}`));
}
