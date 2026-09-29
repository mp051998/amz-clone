import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/supabase/server';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { cancelPendingOrder } from '@/lib/data/orders';

/** Back from Stripe without paying: cancel the pending order (releases stock), keep the cart. */
export async function GET(req: NextRequest): Promise<Response> {
  const market = await getMarket();
  const orderId = req.nextUrl.searchParams.get('order');
  if (orderId) await cancelPendingOrder(await db(), orderId).catch(() => undefined);
  redirect(storePath({ id: market }, '/checkout?canceled=1'));
}
