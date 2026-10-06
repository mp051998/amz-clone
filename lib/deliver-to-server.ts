import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { readUser } from './auth';
import { listAddresses } from './data/addresses';
import { DEFAULT_DELIVER_TO, deliverCookie, normalizePostcode, parseDeliverTo, type DeliverTo } from './deliver-to';
import { db } from './supabase/server';
import type { Address, Market } from './types';

export interface DeliverToView {
  /** null until the shopper picks somewhere (US) */
  current: DeliverTo | null;
  /** the shopper's saved addresses in this store, default first (empty signed out) */
  addresses: Pick<Address, 'id' | 'name' | 'line1' | 'city' | 'zip' | 'isDefault'>[];
}

/**
 * The delivery location for this request: the one picked (cookie), else the default saved
 * address, else the store's default. Cached per request (the header and the page both ask).
 */
export const readDeliverTo = cache(async (market: Market): Promise<DeliverToView> => {
  const [jar, user] = await Promise.all([cookies(), readUser()]);
  const picked = parseDeliverTo(market, jar.get(deliverCookie(market))?.value);
  const saved = user ? await listAddresses(await db(), market).catch(() => []) : [];
  const addresses = saved.map(({ id, name, line1, city, zip, isDefault }) => ({ id, name, line1, city, zip, isDefault }));
  const home = saved[0];
  const homePostcode = home ? normalizePostcode(market, home.zip) : null;
  const current = picked ?? (home && homePostcode ? { postcode: homePostcode, city: home.city } : DEFAULT_DELIVER_TO[market]);
  return { current, addresses };
});
