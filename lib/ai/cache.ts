import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '../supabase/admin';
import type { Json } from '../db/database.types';

/**
 * AI result cache in `ai_cache` (service role only). Keys are
 * sha256(feature, provider, input). Best effort: when the service key is
 * missing or the database errors, reads miss and writes are skipped — callers
 * never see a cache failure.
 */

/** Default time-to-live per feature, in seconds. */
export const CACHE_TTL: Record<string, number> = {
  parseQuery: 7 * 86_400,
  profile: 30 * 86_400,
  reviews: 14 * 86_400,
  compare: 86_400,
  ask: 7 * 86_400,
};

export function cacheKey(feature: string, providerId: string, input: unknown): string {
  return createHash('sha256').update(JSON.stringify([feature, providerId, input])).digest('hex');
}

function admin() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

export async function readCache<T>(key: string): Promise<T | null> {
  const db = admin();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from('ai_cache')
      .select('value, expires_at')
      .eq('key', key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return data.value as T;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, feature: string, providerId: string, value: unknown, ttlSeconds: number): Promise<void> {
  const db = admin();
  if (!db) return;
  try {
    await db.from('ai_cache').upsert({
      key,
      feature,
      provider: providerId,
      value: (value ?? {}) as NonNullable<Json>,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    });
  } catch {
    // best effort
  }
}

/**
 * Memoise an AI call. Only successful AI results should be passed here (the
 * caller's fallback path is not cached), so a transient outage never sticks.
 */
export async function cached<T>(
  feature: string,
  providerId: string,
  input: unknown,
  fn: () => Promise<T>,
  opts: { ttlSeconds?: number; enabled?: boolean } = {},
): Promise<T> {
  if (opts.enabled === false) return fn();
  const key = cacheKey(feature, providerId, input);
  const hit = await readCache<T>(key);
  if (hit !== null) return hit;
  const value = await fn();
  await writeCache(key, feature, providerId, value, opts.ttlSeconds ?? CACHE_TTL[feature] ?? 86_400);
  return value;
}
