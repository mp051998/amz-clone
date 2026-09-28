import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { getCart, mergeGuestCart } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { isToken } from '@/lib/session';

/**
 * POST /api/v1/cart/merge { cartToken } (or X-Cart-Token) — after signing in,
 * fold the guest's carts (every store) into the account. Returns lines merged
 * and the account cart for this store.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const token = isToken(b.cartToken) ? b.cartToken : ctx.cartToken;
  if (!token) throw new DataError('cart_token_required');
  const merged = await mergeGuestCart(ctx.db, token);
  return json({ merged, cart: await getCart(ctx.db, ctx.market) });
});

export const OPTIONS = preflight;
