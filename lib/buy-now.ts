/** Buy Now: checkout for one product at the picked quantity, leaving the cart as it is. */
export interface BuyNow {
  productId: string;
  qty: number;
  /** with the store's protection plan, when the product has one */
  protection?: boolean;
}

/** Buy Now's product, quantity and plan choice from a form or query string; null when there's no product. */
export function readBuyNow(id: unknown, qty: unknown, protection?: unknown): BuyNow | null {
  const productId = typeof id === 'string' ? id.trim() : '';
  if (!productId || productId.length > 120) return null;
  const n = Number(qty);
  const plan = protection === true || protection === '1' || protection === 'on' || protection === 'true';
  return { productId, qty: Number.isInteger(n) && n >= 1 ? Math.min(n, 99) : 1, ...(plan ? { protection: true } : {}) };
}

/** `buy=…&qty=…` (and `protection=1` with the plan), the query that opens checkout for Buy Now. */
export function buyNowQuery(b: BuyNow): string {
  return new URLSearchParams({ buy: b.productId, qty: String(b.qty), ...(b.protection ? { protection: '1' } : {}) }).toString();
}
