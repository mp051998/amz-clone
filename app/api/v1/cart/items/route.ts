import { body, json, preflight, route } from '@/lib/api/http';
import { cartToken } from '@/lib/api/cart';
import { addToCart } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';

/**
 * POST /api/v1/cart/items { productId, qty = 1, size? } — add to the cart (increments an
 * existing line). Capped at stock and 30 per line; 409 out_of_stock when none left. A product that
 * comes in sizes (its `sizes`) needs one of them: 422 size_required without it, and 409
 * size_in_cart when the cart already has it in another size (change that line's size instead).
 */
export const POST = route(async (ctx) => {
  const b = await body(ctx.req);
  const productId = typeof b.productId === 'string' ? b.productId : '';
  const qty = b.qty === undefined ? 1 : Number(b.qty);
  if (!productId) throw new DataError('invalid_input', 'productId', 'productId is required.');
  if (!Number.isInteger(qty) || qty < 1) throw new DataError('invalid_input', 'qty', 'qty must be a positive integer.');
  if (b.size !== undefined && (typeof b.size !== 'string' || !b.size.trim())) throw new DataError('invalid_input', 'size', 'size must be one of the product’s sizes.');
  const { token, minted } = cartToken(ctx, true);
  const cart = await addToCart(ctx.db, ctx.market, productId, qty, token, typeof b.size === 'string' ? b.size.trim() : null);
  return json({ cart, ...(minted ? { cartToken: token } : {}) }, { status: 201, cartToken: token });
});

export const OPTIONS = preflight;
