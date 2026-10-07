import type { CartLine, Product } from './types';

/** A cart line whose product costs something else now than when it went in the cart. */
export interface CartPriceChange {
  product: Product;
  fromMinor: number;
  toMinor: number;
}

/**
 * Amazon's "Important messages about items in your Cart": each line still for sale whose price
 * has gone up or down since it was added, in cart order.
 */
export function cartPriceChanges(lines: CartLine[]): CartPriceChange[] {
  return lines.flatMap((l) =>
    l.available && l.addedPriceMinor != null && l.addedPriceMinor !== l.product.priceMinor
      ? [{ product: l.product, fromMinor: l.addedPriceMinor, toMinor: l.product.priceMinor }]
      : [],
  );
}
