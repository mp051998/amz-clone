import 'server-only';
import { cache } from 'react';
import { db } from './supabase/server';
import { readUser } from './auth';
import { getMarket, readGuestToken } from './session';
import { getCart } from './data/cart';
import { listCategories } from './data/catalog';
import type { Cart, Category } from './types';

/**
 * Request-scoped reads the storefront chrome and pages share, so a page and its
 * AppShell hit the database once for each (React cache is per request).
 */

/** The viewer's cart in the active store — the account's when signed in, else the guest cart. */
export const viewerCart = cache(async (): Promise<Cart> => {
  const [client, market, user] = await Promise.all([db(), getMarket(), readUser()]);
  return getCart(client, market, user ? null : await readGuestToken());
});

/** Departments of the active store, in nav order. */
export const storeCategories = cache(async (): Promise<Category[]> => {
  const [client, market] = await Promise.all([db(), getMarket()]);
  return listCategories(client, market);
});
