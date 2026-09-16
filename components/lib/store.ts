import type { PublicMarketplace } from '@/lib/contracts';

/** Everything a component needs to render regionally is on the public marketplace projection. */
export type Store = PublicMarketplace;

/** True when the store shows whole-rupee prices (design.md §13). */
export function isRupee(store: Store): boolean {
  return store.currency.code === 'INR';
}
