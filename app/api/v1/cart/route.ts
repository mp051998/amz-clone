import { json, preflight, route } from '@/lib/api/http';
import { cartToken } from '@/lib/api/cart';
import { clearCart, getCart } from '@/lib/data/cart';

/** GET /api/v1/cart?market=US — lines priced by the database, stock flags, totals. */
export const GET = route(async (ctx) => {
  const { token } = cartToken(ctx, false);
  return json({ cart: await getCart(ctx.db, ctx.market, token) }, { cartToken: token });
});

/** DELETE /api/v1/cart — empty the cart in this store. */
export const DELETE = route(async (ctx) => {
  const { token } = cartToken(ctx, false);
  return json({ cart: await clearCart(ctx.db, ctx.market, token) }, { cartToken: token });
});

export const OPTIONS = preflight;
