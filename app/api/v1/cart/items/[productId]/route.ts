import { body, json, preflight, route } from '@/lib/api/http';
import { cartToken } from '@/lib/api/cart';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';

/** PATCH /api/v1/cart/items/:productId { qty } — set the quantity; 0 removes the line. */
export const PATCH = route<{ productId: string }>(async (ctx, { productId }) => {
  const qty = Number((await body(ctx.req)).qty);
  if (!Number.isInteger(qty) || qty < 0) throw new DataError('invalid_input', 'qty', 'qty must be a non-negative integer.');
  const { token, minted } = cartToken(ctx, true);
  const cart = await setCartQty(ctx.db, ctx.market, productId, qty, token);
  return json({ cart, ...(minted ? { cartToken: token } : {}) }, { cartToken: token });
});

/** DELETE /api/v1/cart/items/:productId — remove the line. */
export const DELETE = route<{ productId: string }>(async (ctx, { productId }) => {
  const { token } = cartToken(ctx, false);
  return json({ cart: await setCartQty(ctx.db, ctx.market, productId, 0, token) }, { cartToken: token });
});

export const OPTIONS = preflight;
