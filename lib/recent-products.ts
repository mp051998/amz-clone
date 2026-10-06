import 'server-only';
import type { Db } from '@/lib/db/client';
import { getProducts } from '@/lib/data/catalog';
import { readRecentIds } from '@/lib/recent';
import type { Market, Product } from '@/lib/types';

/**
 * What this device looked at, newest first: this store's live products (the history cookie spans
 * both stores), minus `exclude`. A failed lookup is an empty list, never an error page.
 */
export async function recentProducts(client: Db, market: Market, opts: { exclude?: readonly string[]; limit?: number } = {}): Promise<Product[]> {
  try {
    const skip = new Set(opts.exclude ?? []);
    const ids = (await readRecentIds()).filter((id) => !skip.has(id));
    return (await getProducts(client, ids)).filter((p) => p.market === market).slice(0, opts.limit ?? 8);
  } catch {
    return [];
  }
}
