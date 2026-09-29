import type { PublicMarketplace } from '@/lib/contracts';
import { storePath } from '@/lib/marketplace';

/** Everything a component needs to render regionally is on the public marketplace projection. */
export type Store = PublicMarketplace;
export type MarketId = PublicMarketplace['id'];

/** True when the store shows whole-rupee prices (design.md §13). */
export function isRupee(store: Store): boolean {
  return store.currency.code === 'INR';
}

/** Store-aware navigational href from just the market id (client-safe): IN → '/in' prefix. */
export function storeHref(market: MarketId, path: string): string {
  return storePath({ id: market }, path);
}
