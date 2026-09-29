import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getMarketplace } from './marketplace-server';
import type { Market } from './types';

/**
 * A guest's cart is addressed by an unguessable token kept in an httpOnly cookie
 * (API clients send the same token as `X-Cart-Token`). Once the guest signs in
 * the cart is merged into the account and the cookie is dropped.
 */
export const CART_COOKIE = 'cart_token';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isToken(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

export async function readGuestToken(): Promise<string | null> {
  const v = (await cookies()).get(CART_COOKIE)?.value;
  return isToken(v) ? v : null;
}

/** The guest token, minting one first if needed. Server Actions / Route Handlers only. */
export async function ensureGuestToken(): Promise<string> {
  const existing = await readGuestToken();
  if (existing) return existing;
  const token = crypto.randomUUID();
  (await cookies()).set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
  return token;
}

export async function clearGuestToken(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
}

/** Active store for this request as a market id. */
export const getMarket = cache(async (): Promise<Market> => (await getMarketplace()).id);
