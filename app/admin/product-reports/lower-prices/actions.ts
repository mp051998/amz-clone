'use server';
import { redirect } from 'next/navigation';
import { DataError } from '@/lib/data/errors';
import { reviewPriceReports } from '@/lib/data/lower-price';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { adminClient } from '../../guard';

/** Mark a product's open lower-price reports reviewed (bound to its id), then back to the open ones. */
export async function reviewPricesAction(productId: string): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => storePath(store, `/admin/product-reports/lower-prices?${qs}`);
  if (typeof productId !== 'string' || !productId) redirect(back('error=product_not_found'));
  const { client, error } = await adminClient();
  if (error) redirect(back('error=forbidden'));
  let code: string | null = null;
  try {
    await reviewPriceReports(client, store.id, productId);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  redirect(back(code ? `error=${encodeURIComponent(code)}` : 'done=reviewed'));
}
