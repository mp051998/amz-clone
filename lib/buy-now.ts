/** Buy Now: checkout for one product at the picked quantity, leaving the cart as it is. */
export interface BuyNow {
  productId: string;
  qty: number;
  /** with the store's protection plan, when the product has one */
  protection?: boolean;
  /** the size picked, for a product that comes in sizes */
  size?: string;
}

/** Longest size a product can list (cart_items_size_check). */
export const SIZE_MAX = 12;

/** Buy Now's product, quantity, plan choice and size from a form or query string; null when there's no product. */
export function readBuyNow(id: unknown, qty: unknown, protection?: unknown, size?: unknown): BuyNow | null {
  const productId = typeof id === 'string' ? id.trim() : '';
  if (!productId || productId.length > 120) return null;
  const n = Number(qty);
  const plan = protection === true || protection === '1' || protection === 'on' || protection === 'true';
  const picked = typeof size === 'string' ? size.trim() : '';
  return {
    productId,
    qty: Number.isInteger(n) && n >= 1 ? Math.min(n, 99) : 1,
    ...(plan ? { protection: true } : {}),
    ...(picked && picked.length <= SIZE_MAX ? { size: picked } : {}),
  };
}

/** `buy=…&qty=…` (and `protection=1` with the plan, `size=…` with a size), the query that opens checkout for Buy Now. */
export function buyNowQuery(b: BuyNow): string {
  return new URLSearchParams({
    buy: b.productId,
    qty: String(b.qty),
    ...(b.protection ? { protection: '1' } : {}),
    ...(b.size ? { size: b.size } : {}),
  }).toString();
}
