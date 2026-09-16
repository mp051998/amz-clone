import { cookies } from 'next/headers';
import type { CurrencyCode } from './contracts';

export const ORDERS_COOKIE = 'amz_orders';

/** compact stored shape (kept small to fit the cookie budget). `p` = unit price in `cur`. */
export interface StoredOrderItem { id: string; q: number; p: number }
export interface StoredOrder {
  id: string;
  ts: number;
  items: StoredOrderItem[];
  cur: CurrencyCode;
  sub: number;
  ship: number;
  tax: number;
  tot: number;
  name: string;
  city: string;
  zip: string;
  last4: string;
}

const MAX_ORDERS = 8;

export function newOrderId(): string {
  const rand = Math.floor(Math.random() * 9_000_000 + 1_000_000);
  return `114-${rand}-${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`;
}

export async function readOrders(): Promise<StoredOrder[]> {
  const raw = (await cookies()).get(ORDERS_COOKIE)?.value;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as StoredOrder[]) : [];
  } catch {
    return [];
  }
}

/** prepend a new order, trimming to fit both the count cap and the cookie size budget. */
export async function writeOrder(order: StoredOrder): Promise<void> {
  const jar = await cookies();
  let list = [order, ...(await readOrders())].slice(0, MAX_ORDERS);
  let value = JSON.stringify(list);
  while (value.length > 3800 && list.length > 1) {
    list = list.slice(0, -1);
    value = JSON.stringify(list);
  }
  jar.set(ORDERS_COOKIE, value, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function getOrder(id: string): Promise<StoredOrder | undefined> {
  return (await readOrders()).find((o) => o.id === id);
}
