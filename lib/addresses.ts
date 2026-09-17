import { cookies } from 'next/headers';
import { getMarketplace } from './marketplace-server';

export const ADDR_COOKIE = 'amz_addr';

/**
 * A saved shipping address. Field names are store-neutral; the US/IN schema
 * difference is only in which fields the form collects (landmark/kind are IN-only).
 */
export interface Address {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  zip: string;
  kind?: 'home' | 'office';
  isDefault?: boolean;
}

const MAX_ADDRESSES = 5;

/**
 * Address-book cookie name for the active store. Like the cart, amazon.com and
 * amazon.in keep separate books (different address schemas and countries):
 * US -> `amz_addr`, IN -> `amz_addr_in`. Store is read from the request header.
 */
async function addrCookieName(): Promise<string> {
  const store = await getMarketplace();
  return store.id === 'IN' ? `${ADDR_COOKIE}_in` : ADDR_COOKIE;
}

export function newAddressId(): string {
  return `addr_${Math.random().toString(36).slice(2, 10)}`;
}

/** parse the active store's address cookie into a list (safe on malformed input). */
export async function readAddresses(): Promise<Address[]> {
  const raw = (await cookies()).get(await addrCookieName())?.value;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Address[]) : [];
  } catch {
    return [];
  }
}

/** persist the active store's address book. Only callable inside a Server Action / Route Handler. */
export async function writeAddresses(list: Address[]): Promise<void> {
  const jar = await cookies();
  const name = await addrCookieName();
  const trimmed = list.slice(0, MAX_ADDRESSES);
  if (trimmed.length === 0) {
    jar.delete(name);
    return;
  }
  jar.set(name, JSON.stringify(trimmed), {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** the address to prefill checkout with: the explicit default, else the first saved. */
export async function getDefaultAddress(): Promise<Address | undefined> {
  const list = await readAddresses();
  return list.find((a) => a.isDefault) ?? list[0];
}

export async function getAddress(id: string): Promise<Address | undefined> {
  return (await readAddresses()).find((a) => a.id === id);
}
