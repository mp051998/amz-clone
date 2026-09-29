import 'server-only';
import type { ApiContext } from './http';

/**
 * Which cart a request addresses: the account's when authenticated, otherwise
 * the guest cart named by X-Cart-Token. A guest's first write mints a token,
 * which the route returns in the X-Cart-Token response header.
 */
export function cartToken(ctx: ApiContext, mint: boolean): { token: string | null; minted: boolean } {
  if (ctx.user) return { token: null, minted: false };
  if (ctx.cartToken) return { token: ctx.cartToken, minted: false };
  return mint ? { token: crypto.randomUUID(), minted: true } : { token: null, minted: false };
}
