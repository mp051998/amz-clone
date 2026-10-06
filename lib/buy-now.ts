/** Buy Now: checkout for one product at the picked quantity, leaving the cart as it is. */
export interface BuyNow {
  productId: string;
  qty: number;
}

/** Buy Now's product and quantity from a form or query string; null when there's no product. */
export function readBuyNow(id: unknown, qty: unknown): BuyNow | null {
  const productId = typeof id === 'string' ? id.trim() : '';
  if (!productId || productId.length > 120) return null;
  const n = Number(qty);
  return { productId, qty: Number.isInteger(n) && n >= 1 ? Math.min(n, 99) : 1 };
}

/** `buy=…&qty=…`, the query that opens checkout for Buy Now. */
export function buyNowQuery(b: BuyNow): string {
  return new URLSearchParams({ buy: b.productId, qty: String(b.qty) }).toString();
}
