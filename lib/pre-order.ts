/**
 * Pre-orders: a product whose release date is still to come is sold ahead of it and ships when
 * it comes out. Pure — pass `now` for deterministic output.
 */

/** Its release (ISO) when it's still to come — it's a pre-order — else null. */
export function releaseOf(product: { releaseAt?: string }, now: Date = new Date()): string | null {
  const at = product.releaseAt ? Date.parse(product.releaseAt) : NaN;
  return Number.isFinite(at) && at > now.getTime() ? product.releaseAt! : null;
}

/** The latest release still to come among these products (what an order of them waits for), or null. */
export function latestRelease(products: readonly { releaseAt?: string }[], now: Date = new Date()): string | null {
  let latest: string | null = null;
  for (const p of products) {
    const r = releaseOf(p, now);
    if (r && (!latest || Date.parse(r) > Date.parse(latest))) latest = r;
  }
  return latest;
}
