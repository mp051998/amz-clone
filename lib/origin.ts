import 'server-only';
import { headers } from 'next/headers';

/** Absolute origin of the current request (for Stripe's absolute return URLs). */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3100';
  const proto = h.get('x-forwarded-proto') ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
