import type { Allowance } from './data/purchase-limits';

/**
 * How many more units of a product the shopper can buy: what's left of its limit per customer
 * (the whole limit when we don't know what they've bought, e.g. signed out), or null for no limit.
 */
export function unitsLeft(product: { id: string; maxPerCustomer?: number }, allowance: ReadonlyMap<string, Allowance>): number | null {
  const a = allowance.get(product.id);
  if (a) return a.left;
  return product.maxPerCustomer ?? null;
}

/** "Limit 3 per customer", and what's left of it once some have been bought. */
export function limitNote(limit: number, left: number | null): string {
  if (left === null || left >= limit) return `Limit ${limit} per customer`;
  if (left === 0) return `Limit ${limit} per customer · You’ve bought ${limit}`;
  return `Limit ${limit} per customer · You can buy ${left} more`;
}
