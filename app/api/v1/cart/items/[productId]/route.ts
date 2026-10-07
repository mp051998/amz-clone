import { body, json, preflight, route } from '@/lib/api/http';
import { cartToken } from '@/lib/api/cart';
import { selectCartLines, setCartProtection, setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';

/**
 * PATCH /api/v1/cart/items/:productId { qty?, selected?, protection? } — set the quantity (0 removes
 * the line), tick or untick the line for checkout, and/or add or drop the store's protection plan.
 * At least one of them.
 */
export const PATCH = route<{ productId: string }>(async (ctx, { productId }) => {
  const b = await body(ctx.req);
  const qty = b.qty === undefined ? undefined : Number(b.qty);
  if (qty !== undefined && (!Number.isInteger(qty) || qty < 0)) throw new DataError('invalid_input', 'qty', 'qty must be a non-negative integer.');
  if (b.selected !== undefined && typeof b.selected !== 'boolean') throw new DataError('invalid_input', 'selected', 'selected must be true or false.');
  if (b.protection !== undefined && typeof b.protection !== 'boolean') throw new DataError('invalid_input', 'protection', 'protection must be true or false.');
  if (qty === undefined && b.selected === undefined && b.protection === undefined) throw new DataError('invalid_input', 'qty', 'Send qty, selected or protection.');
  const { token, minted } = cartToken(ctx, true);
  let cart = qty === undefined ? null : await setCartQty(ctx.db, ctx.market, productId, qty, token);
  // a line that qty 0 just removed has nothing left to tick
  if (typeof b.selected === 'boolean' && qty !== 0) cart = await selectCartLines(ctx.db, ctx.market, productId, b.selected, token);
  if (typeof b.protection === 'boolean' && qty !== 0) cart = await setCartProtection(ctx.db, ctx.market, productId, b.protection, token);
  return json({ cart, ...(minted ? { cartToken: token } : {}) }, { cartToken: token });
});

/** DELETE /api/v1/cart/items/:productId — remove the line. */
export const DELETE = route<{ productId: string }>(async (ctx, { productId }) => {
  const { token } = cartToken(ctx, false);
  return json({ cart: await setCartQty(ctx.db, ctx.market, productId, 0, token) }, { cartToken: token });
});

export const OPTIONS = preflight;
