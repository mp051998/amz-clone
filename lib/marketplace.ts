import type { PublicMarketplace } from './contracts';
import { amazon } from './amazon';
import { amazonIn } from './marketplace-in';

/** Both stores, keyed by country. Pure + client-safe (no next/headers). */
export const MARKETS: Record<'US' | 'IN', PublicMarketplace> = { US: amazon, IN: amazonIn };

/**
 * Prefix an in-store path so navigation stays inside the active store.
 * US: unchanged. IN: '/foo' → '/in/foo', '/' → '/in'. Non-root paths must start with '/'.
 * Never pass asset URLs (e.g. /products/x.jpg) through this — only navigational links.
 */
export function storePath(store: Pick<PublicMarketplace, 'id'>, path: string): string {
  if (store.id !== 'IN') return path;
  if (path === '/') return '/in';
  return path.startsWith('/') ? `/in${path}` : path;
}

/**
 * The store's sign-in page, coming back to `here` (an in-store path, query included) after.
 * Home and the sign-in pages themselves need no return trip. `create` opens it on "Create account".
 */
export function signInPath(store: Pick<PublicMarketplace, 'id'>, here?: string | null, { create = false } = {}): string {
  const back = here && here !== '/' && !/^\/(signin|auth)(\/|\?|$)/.test(here) ? here : null;
  const qs = [create ? 'new=1' : null, back ? `next=${encodeURIComponent(back)}` : null].filter(Boolean).join('&');
  return storePath(store, qs ? `/signin?${qs}` : '/signin');
}
