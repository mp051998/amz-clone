/**
 * At or below this many units a product warns "Only N left in stock — order soon." (its page's
 * buy box and Things to know, and its search result). A plain module, so server pages read the
 * number itself: imported from a 'use client' file they'd get a client reference instead.
 */
export const LOW_STOCK = 10;

/** "Only 4 left in stock" while 1 to LOW_STOCK are left; null otherwise. */
export function lowStockText(stock: number): string | null {
  return stock > 0 && stock <= LOW_STOCK ? `Only ${stock} left in stock` : null;
}
