'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminCancelOrder, deliverOrder, getStoreOrder, retryRefund, shipOrder } from '@/lib/data/admin-orders';
import { DataError } from '@/lib/data/errors';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { adminClient } from '../guard';

const RUN = { ship: shipOrder, deliver: deliverOrder, cancel: adminCancelOrder, refund: retryRefund } as const;

/**
 * One admin move on an order (bound to the order id and move, both checked here since a client
 * can send anything), then back to the order with a notice or the error.
 */
export async function orderAction(orderId: string, move: string): Promise<void> {
  const store = await getMarketplace();
  const page = (qs: string) => storePath(store, `/admin/orders/${encodeURIComponent(String(orderId))}?${qs}`);
  if (typeof orderId !== 'string' || !/^\d{3}-\d{7}-\d{7}$/.test(orderId) || !Object.hasOwn(RUN, move)) {
    redirect(storePath(store, '/admin/orders?error=not_found'));
  }
  const { client, error } = await adminClient();
  if (error) redirect(page('error=forbidden'));
  let code: string | null = null;
  try {
    await getStoreOrder(client, store.id, orderId);
    await RUN[move as keyof typeof RUN](client, orderId);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(page(code ? `error=${encodeURIComponent(code)}` : `done=${move}`));
}
