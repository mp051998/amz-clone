import type { Db } from '../db/client';
import type { Database } from '../db/database.types';
import type { Collection, CollectionItem } from '../decision/types';
import type { Market } from '../types';
import { getProducts } from './catalog';
import { DataError, unwrap } from './errors';

/**
 * Customer collections ("Things I'm Considering", "Saved for later", and lists
 * they make). Every function takes the caller's client: row-level security
 * scopes reads and writes to the signed-in user, triggers enforce the limits
 * (20 collections, 200 items each) and stamp the price at save time.
 */

export type CollectionKind = NonNullable<Collection['kind']>;

/** Display names of the two system lists. */
export const SYSTEM_COLLECTION_NAMES: Record<Exclude<CollectionKind, 'custom'>, string> = {
  considering: "Things I'm Considering",
  later: 'Saved for later',
};

type CollectionRow = Database['public']['Tables']['collections']['Row'];
type ItemRow = Pick<Database['public']['Tables']['collection_items']['Row'], 'product_id' | 'saved_price_minor' | 'added_at'>;
type RowWithItems = CollectionRow & { collection_items?: ItemRow[] };

const KIND_ORDER: Record<string, number> = { considering: 0, custom: 1, later: 2 };

function asKind(v: string): CollectionKind {
  return v === 'considering' || v === 'later' ? v : 'custom';
}

function parseName(v: unknown): string {
  const name = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new DataError('invalid_input', 'name', 'Give the collection a name.');
  if (name.length > 60) throw new DataError('invalid_input', 'name', 'Keep the name under 60 characters.');
  return name;
}

function parseNote(v: unknown): string {
  const note = typeof v === 'string' ? v.trim() : '';
  if (note.length > 500) throw new DataError('invalid_input', 'note', 'Keep the note under 500 characters.');
  return note;
}

async function hydrate(db: Db, rows: RowWithItems[]): Promise<Collection[]> {
  const ids = [...new Set(rows.flatMap((r) => (r.collection_items ?? []).map((i) => i.product_id)))];
  const products = new Map((await getProducts(db, ids, { includeArchived: true })).map((p) => [p.id, p]));
  return rows
    .slice()
    .sort(
      (a, b) =>
        (KIND_ORDER[a.kind] ?? 1) - (KIND_ORDER[b.kind] ?? 1) ||
        a.position - b.position ||
        a.created_at.localeCompare(b.created_at),
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      note: r.note,
      kind: asKind(r.kind),
      createdAt: r.created_at,
      items: (r.collection_items ?? [])
        .slice()
        .sort((a, b) => b.added_at.localeCompare(a.added_at))
        .flatMap((i): CollectionItem[] => {
          const product = products.get(i.product_id);
          return product ? [{ product, savedPriceMinor: i.saved_price_minor, addedAt: i.added_at }] : [];
        }),
    }));
}

const WITH_ITEMS = '*, collection_items(product_id, saved_price_minor, added_at)';

/** The caller's collections in a store, with items and live products (system lists first/last). */
export async function listCollections(db: Db, market: Market): Promise<Collection[]> {
  const rows = unwrap(await db.from('collections').select(WITH_ITEMS).eq('market_id', market));
  return hydrate(db, rows as RowWithItems[]);
}

/** One of the caller's collections, or null (someone else's is invisible). */
export async function getCollection(db: Db, id: string): Promise<Collection | null> {
  if (!isUuid(id)) return null;
  const row = unwrap(await db.from('collections').select(WITH_ITEMS).eq('id', id).maybeSingle());
  return row ? (await hydrate(db, [row as RowWithItems]))[0] : null;
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Create a collection. `409 duplicate` when the name is taken in this store, `409 collection_limit` past 20. */
export async function createCollection(
  db: Db,
  market: Market,
  input: { name: unknown; note?: unknown; kind?: CollectionKind },
): Promise<Collection> {
  const name = parseName(input.name);
  const note = parseNote(input.note);
  const row = unwrap(
    await db
      .from('collections')
      .insert({ market_id: market, name, note, kind: input.kind ?? 'custom' })
      .select('*')
      .single(),
  );
  return { id: row.id, name: row.name, note: row.note, kind: asKind(row.kind), createdAt: row.created_at, items: [] };
}

/** Rename and/or re-note a collection. Returns the updated collection with items. */
export async function updateCollection(db: Db, id: string, patch: { name?: unknown; note?: unknown }): Promise<Collection> {
  if (!isUuid(id)) throw new DataError('collection_not_found');
  const update: { name?: string; note?: string } = {};
  if (patch.name !== undefined) update.name = parseName(patch.name);
  if (patch.note !== undefined) update.note = parseNote(patch.note);
  if (!Object.keys(update).length) throw new DataError('invalid_input', 'name', 'Nothing to update.');
  const rows = unwrap(await db.from('collections').update(update).eq('id', id).select('id'));
  if (!rows.length) throw new DataError('collection_not_found');
  const c = await getCollection(db, id);
  if (!c) throw new DataError('collection_not_found');
  return c;
}

export async function deleteCollection(db: Db, id: string): Promise<void> {
  if (!isUuid(id)) throw new DataError('collection_not_found');
  const rows = unwrap(await db.from('collections').delete().eq('id', id).select('id'));
  if (!rows.length) throw new DataError('collection_not_found');
}

/**
 * Add a product (idempotent — re-adding keeps the original saved price).
 * The database stamps `savedPriceMinor` with the current catalog price and
 * rejects products from another store (`404 product_not_found`).
 */
export async function addItem(db: Db, collectionId: string, productId: string): Promise<CollectionItem> {
  if (!isUuid(collectionId)) throw new DataError('collection_not_found');
  const owned = unwrap(await db.from('collections').select('id').eq('id', collectionId).maybeSingle());
  if (!owned) throw new DataError('collection_not_found');
  unwrap(
    await db
      .from('collection_items')
      // saved_price_minor is overwritten by the trigger; the column is required by the table type
      .upsert({ collection_id: collectionId, product_id: productId, saved_price_minor: 1 }, { onConflict: 'collection_id,product_id', ignoreDuplicates: true }),
  );
  const item = unwrap(
    await db
      .from('collection_items')
      .select('product_id, saved_price_minor, added_at')
      .eq('collection_id', collectionId)
      .eq('product_id', productId)
      .maybeSingle(),
  );
  const [product] = await getProducts(db, [productId]);
  if (!item || !product) throw new DataError('product_not_found');
  return { product, savedPriceMinor: item.saved_price_minor, addedAt: item.added_at };
}

/** Remove a product from one collection (no-op when absent). */
export async function removeItem(db: Db, collectionId: string, productId: string): Promise<void> {
  if (!isUuid(collectionId)) throw new DataError('collection_not_found');
  unwrap(await db.from('collection_items').delete().eq('collection_id', collectionId).eq('product_id', productId));
}

/** Ids of every product the caller has saved in any collection in this store. */
export async function savedProductIds(db: Db, market: Market): Promise<Set<string>> {
  const rows = unwrap(
    await db.from('collection_items').select('product_id, collections!inner(market_id)').eq('collections.market_id', market),
  );
  return new Set(rows.map((r) => r.product_id));
}

/**
 * The id of a system collection ("Things I'm Considering" / "Saved for later"),
 * creating it on first use. If the shopper already has a custom list with the
 * same name, the system list gets a numbered name.
 */
export async function ensureSystemCollection(
  db: Db,
  market: Market,
  kind: Exclude<CollectionKind, 'custom'>,
): Promise<{ id: string; name: string }> {
  const find = async () =>
    unwrap(await db.from('collections').select('id, name').eq('market_id', market).eq('kind', kind).maybeSingle());
  const existing = await find();
  if (existing) return existing;
  const base = SYSTEM_COLLECTION_NAMES[kind];
  for (const name of [base, `${base} (2)`, `${base} (3)`]) {
    try {
      const c = await createCollection(db, market, { name, kind });
      return { id: c.id, name: c.name };
    } catch (err) {
      if (!(err instanceof DataError) || err.code !== 'duplicate') throw err;
      const raced = await find(); // created concurrently by another request
      if (raced) return raced;
    }
  }
  throw new DataError('duplicate');
}

/** "Things I'm Considering" — the Save button's list. */
export function ensureDefaultCollection(db: Db, market: Market) {
  return ensureSystemCollection(db, market, 'considering');
}

export interface SaveState {
  saved: boolean;
  /** The list it was saved to (null when un-saving). */
  collectionName: string | null;
}

/**
 * The Save button: saves to "Things I'm Considering" when the product is in no
 * collection; otherwise removes it from every collection in this store.
 */
export async function toggleSaved(db: Db, market: Market, productId: string): Promise<SaveState> {
  const collections = unwrap(await db.from('collections').select('id').eq('market_id', market));
  const ids = collections.map((c) => c.id);
  if (ids.length) {
    const removed = unwrap(
      await db.from('collection_items').delete().eq('product_id', productId).in('collection_id', ids).select('product_id'),
    );
    if (removed.length) return { saved: false, collectionName: null };
  }
  const target = await ensureDefaultCollection(db, market);
  await addItem(db, target.id, productId);
  return { saved: true, collectionName: target.name };
}
