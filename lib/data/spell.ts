import type { Db } from '../db/client';
import { buildVocab, correctQuery, type Correction, type Vocab } from '../spell';
import type { Market } from '../types';
import { searchCatalog } from './catalog';

/** how long a store's word list is reused before it's read again (new products show up after) */
const VOCAB_TTL_MS = 10 * 60_000;
const cache = new Map<Market, { at: number; vocab: Vocab }>();

/** The words search matches in a store: every product's title, brand and department name. */
export async function storeVocab(db: Db, market: Market, now = Date.now()): Promise<Vocab> {
  const hit = cache.get(market);
  if (hit && now - hit.at < VOCAB_TTL_MS) return hit.vocab;
  const res = await db.from('catalog_products').select('title, brand, category_name').eq('market_id', market).limit(5000);
  if (res.error) return hit?.vocab ?? new Map();
  const vocab = buildVocab(res.data.flatMap((r) => [r.title, r.brand, r.category_name]));
  cache.set(market, { at: now, vocab });
  return vocab;
}

/** for tests */
export function clearVocabCache(): void {
  cache.clear();
}

/**
 * A corrected search for one that found nothing, or null. Only offered when the corrected words
 * do find products (in the same department, if there is one), so it never swaps one empty page for
 * another.
 */
export async function spellFix(db: Db, market: Market, query: string, keywords: string, dept?: string | null): Promise<Correction | null> {
  if (!keywords.trim()) return null;
  const fix = correctQuery(query, keywords, await storeVocab(db, market));
  if (!fix) return null;
  const found = await searchCatalog(db, market, { k: fix.keywords, dept: dept ?? undefined, sort: 'featured', page: 1 }).catch(() => null);
  return found && found.total > 0 ? fix : null;
}
