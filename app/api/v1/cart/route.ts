import { body, json, preflight, route } from '@/lib/api/http';
import { cartToken } from '@/lib/api/cart';
import { clearCart, getCart, selectCartLines } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';

/** GET /api/v1/cart?market=US — lines priced by the database, stock flags, totals. */
export const GET = route(async (ctx) => {
  const { token } = cartToken(ctx, false);
  return json({ cart: await getCart(ctx.db, ctx.market, token) }, { cartToken: token });
});

/** PATCH /api/v1/cart { selected } — tick or untick every line for checkout. */
export const PATCH = route(async (ctx) => {
  const { selected } = await body(ctx.req);
  if (typeof selected !== 'boolean') throw new DataError('invalid_input', 'selected', 'selected must be true or false.');
  const { token } = cartToken(ctx, false);
  return json({ cart: await selectCartLines(ctx.db, ctx.market, null, selected, token) }, { cartToken: token });
});

/** DELETE /api/v1/cart — empty the cart in this store. */
export const DELETE = route(async (ctx) => {
  const { token } = cartToken(ctx, false);
  return json({ cart: await clearCart(ctx.db, ctx.market, token) }, { cartToken: token });
});

export const OPTIONS = preflight;
