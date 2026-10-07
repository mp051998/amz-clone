import type { Db } from '../db/client';
import type { Database } from '../db/database.types';
import type { Collection, CollectionItem } from '../decision/types';
import type { Market, Product } from '../types';
import { getProducts } from './catalog';
import { DataError, unwrap } from './errors';

/**
 * Customer collections ("Things I'm Considering", "Saved for later", and lists
 * they make). Every function takes the caller's client: row-level security
 * scopes reads and writes to the signed-in user, triggers enforce the limits
 * (20 collections, 200 items each) and stamp the price and stock at save time.
 */

export type CollectionKind = NonNullable<Collection['kind']>;

/** Display names of the two system lists. */
export const SYSTEM_COLLECTION_NAMES: Record<Exclude<CollectionKind, 'custom'>, string> = {
  considering: "Things I'm Considering",
  later: 'Saved for later',
};

type CollectionRow = Database['public']['Tables']['collections']['Row'];
type ItemRow = Pick<Database['public']['Tables']['collection_items']['Row'], 'product_id' | 'saved_price_minor' | 'saved_in_stock' | 'added_at'>;
type RowWithItems = CollectionRow & { collection_items?: ItemRow[] };

const KIND_ORDER: Record<string, number> = { considering: 0, custom: 1, later: 2 };

/** considering, then custom lists (by position, oldest first), then "Saved for later". */
function byListOrder(a: Pick<CollectionRow, 'kind' | 'position' | 'created_at'>, b: Pick<CollectionRow, 'kind' | 'position' | 'created_at'>): number {
  return (KIND_ORDER[a.kind] ?? 1) - (KIND_ORDER[b.kind] ?? 1) || a.position - b.position || a.created_at.localeCompare(b.created_at);
}

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
    .sort(byListOrder)
    .map((r) => ({
      id: r.id,
      name: r.name,
      note: r.note,
      kind: asKind(r.kind),
      createdAt: r.created_at,
      shareToken: r.share_token ?? null,
      items: (r.collection_items ?? [])
        .slice()
        .sort((a, b) => b.added_at.localeCompare(a.added_at))
        .flatMap((i): CollectionItem[] => {
          const product = products.get(i.product_id);
          return product ? [{ product, savedPriceMinor: i.saved_price_minor, savedInStock: i.saved_in_stock, addedAt: i.added_at }] : [];
        }),
    }));
}

const WITH_ITEMS = '*, collection_items(product_id, saved_price_minor, saved_in_stock, added_at)';

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
 * `savedInStock` with whether it can be bought now, and rejects products from
 * another store (`404 product_not_found`).
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
      .select('product_id, saved_price_minor, saved_in_stock, added_at')
      .eq('collection_id', collectionId)
      .eq('product_id', productId)
      .maybeSingle(),
  );
  const [product] = await getProducts(db, [productId]);
  if (!item || !product) throw new DataError('product_not_found');
  return { product, savedPriceMinor: item.saved_price_minor, savedInStock: item.saved_in_stock, addedAt: item.added_at };
}

/** Remove a product from one collection (no-op when absent). */
export async function removeItem(db: Db, collectionId: string, productId: string): Promise<void> {
  if (!isUuid(collectionId)) throw new DataError('collection_not_found');
  unwrap(await db.from('collection_items').delete().eq('collection_id', collectionId).eq('product_id', productId));
}

/**
 * Move a product to another of the caller's lists in the same store. It keeps the price it was
 * saved at; if it's already on the target list, that copy stays and this one goes.
 */
export async function moveItem(db: Db, fromId: string, toId: string, productId: string): Promise<void> {
  if (!isUuid(fromId) || !isUuid(toId)) throw new DataError('collection_not_found');
  if (fromId === toId) throw new DataError('invalid_input', 'to', 'Pick a different list.');
  unwrap(await db.rpc('move_collection_item', { p_from: fromId, p_to: toId, p_product: productId }));
}

/** One of the caller's lists, and whether a given product is on it (the PDP "Add to List" menu). */
export interface ListChoice {
  id: string;
  name: string;
  kind: CollectionKind;
  has: boolean;
}

/** The caller's lists in this store (same order as /collections), each marked if it holds `productId`. */
export async function listChoices(db: Db, market: Market, productId: string): Promise<ListChoice[]> {
  const rows = unwrap(
    await db
      .from('collections')
      .select('id, name, kind, position, created_at, collection_items(product_id)')
      .eq('market_id', market)
      .eq('collection_items.product_id', productId),
  );
  return rows
    .slice()
    .sort(byListOrder)
    .map((r) => ({ id: r.id, name: r.name, kind: asKind(r.kind), has: (r.collection_items ?? []).length > 0 }));
}

/** A saved product that costs less now than when it was saved. */
export interface PriceDrop {
  product: Product;
  savedPriceMinor: number;
  /** saved price minus today's, in the product's own currency */
  dropMinor: number;
}

/**
 * Saved products that are cheaper now than when they were saved, biggest drop (by share) first.
 * A product on several lists counts once, against the highest price it was saved at. Products
 * that are sold out or off sale are left out: there's nothing to buy.
 */
export function priceDrops(items: { product: Product; savedPriceMinor: number }[]): PriceDrop[] {
  const best = new Map<string, PriceDrop>();
  for (const { product, savedPriceMinor } of items) {
    const dropMinor = savedPriceMinor - product.priceMinor;
    if (dropMinor <= 0 || product.archived || product.stock <= 0) continue;
    const seen = best.get(product.id);
    if (!seen || dropMinor > seen.dropMinor) best.set(product.id, { product, savedPriceMinor, dropMinor });
  }
  return [...best.values()].sort((a, b) => b.dropMinor / b.savedPriceMinor - a.dropMinor / a.savedPriceMinor);
}

/** Saved while sold out, and can be bought again now. */
export function isBackInStock(item: { product: Product; savedInStock: boolean }): boolean {
  return !item.savedInStock && !item.product.archived && item.product.stock > 0;
}

/** A saved product that was sold out when it was saved and is in stock again. */
export interface BackInStock {
  product: Product;
  /** the highest price it was saved at; above today's when it's cheaper too */
  savedPriceMinor: number;
}

type SavedItem = { product: Product; savedPriceMinor: number; savedInStock: boolean; addedAt: string };

/**
 * Saved products that were sold out when saved and can be bought now, latest saved first. A
 * product on several lists counts once, by the copy saved last: saving it again while in stock
 * means the shopper has seen it back.
 */
export function backInStock(items: SavedItem[]): BackInStock[] {
  const last = new Map<string, { item: SavedItem; savedPriceMinor: number }>();
  for (const item of items) {
    const seen = last.get(item.product.id);
    last.set(item.product.id, {
      item: seen && seen.item.addedAt > item.addedAt ? seen.item : item,
      savedPriceMinor: Math.max(seen?.savedPriceMinor ?? 0, item.savedPriceMinor),
    });
  }
  return [...last.values()]
    .filter(({ item }) => isBackInStock(item))
    .sort((a, b) => b.item.addedAt.localeCompare(a.item.addedAt))
    .map(({ item, savedPriceMinor }) => ({ product: item.product, savedPriceMinor }));
}

/** What changed on the caller's saved products in this store (the home page rows). */
export interface SavedUpdates {
  back: BackInStock[];
  /** price drops on the rest: a product back in stock shows once, under `back` */
  drops: PriceDrop[];
}

/** Back in stock and price drops across all the caller's lists in this store, up to `limit` of each. */
export async function savedUpdates(db: Db, market: Market, limit = 8): Promise<SavedUpdates> {
  const rows = unwrap(
    await db
      .from('collection_items')
      .select('product_id, saved_price_minor, saved_in_stock, added_at, collections!inner(market_id)')
      .eq('collections.market_id', market),
  );
  const byId = new Map((await getProducts(db, [...new Set(rows.map((r) => r.product_id))])).map((p) => [p.id, p]));
  const items = rows.flatMap((r) => {
    const product = byId.get(r.product_id);
    return product ? [{ product, savedPriceMinor: r.saved_price_minor, savedInStock: r.saved_in_stock, addedAt: r.added_at }] : [];
  });
  const back = backInStock(items);
  const backIds = new Set(back.map((b) => b.product.id));
  return { back: back.slice(0, limit), drops: priceDrops(items.filter((i) => !backIds.has(i.product.id))).slice(0, limit) };
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

/** A collection as anyone with its link sees it (/lists/<token>): no note, no saved prices. */
export interface SharedList {
  token: string;
  name: string;
  kind: CollectionKind;
  market: Market;
  /** the sharer's first name */
  ownerName: string;
  sharedAt: string;
  /** the viewer shared it; `collectionId` is then theirs to manage */
  mine: boolean;
  collectionId: string | null;
  /** still to buy first, then bought; newest first within each. Products no longer on sale are left out */
  products: Product[];
  /** items gift givers marked bought: by the viewer (`you`) or another giver. Empty for the owner */
  bought: Record<string, GiftMark>;
}

export type GiftMark = 'you' | 'someone';

export function isShareToken(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
}

/** Turn on the link for one of the caller's collections (the same link if it's already on). */
export async function shareCollection(db: Db, id: string): Promise<{ token: string; sharedAt: string }> {
  if (!isUuid(id)) throw new DataError('collection_not_found');
  const r = unwrap(await db.rpc('share_collection', { p_collection: id })) as unknown as { token: string; shared_at: string };
  return { token: r.token, sharedAt: r.shared_at };
}

/** Turn the link off; the old one stops working, and sharing again makes a new one. */
export async function unshareCollection(db: Db, id: string): Promise<void> {
  if (!isUuid(id)) throw new DataError('collection_not_found');
  unwrap(await db.rpc('unshare_collection', { p_collection: id }));
}

interface SharedRow {
  name: string;
  kind: string;
  market_id: string;
  shared_at: string;
  owner_name: string;
  mine: boolean;
  collection_id: string | null;
  items: { product_id: string; added_at: string; bought?: GiftMark | null }[];
}

/** A shared list by its link, or null when the link is off or never existed. */
export async function getSharedList(db: Db, token: string): Promise<SharedList | null> {
  if (!isShareToken(token)) return null;
  const res = await db.rpc('shared_collection', { p_token: token });
  // before the migration (the app can deploy a moment before it): no list
  if (res.error?.code === 'PGRST202') return null;
  const row = unwrap(res) as unknown as SharedRow | null;
  if (!row) return null;
  const bought: Record<string, GiftMark> = {};
  for (const i of row.items) if (i.bought === 'you' || i.bought === 'someone') bought[i.product_id] = i.bought;
  // stable: newest first stays within each group
  const ids = row.items.map((i) => i.product_id).sort((a, b) => Number(a in bought) - Number(b in bought));
  const byId = new Map((await getProducts(db, ids)).map((p) => [p.id, p]));
  return {
    token,
    name: row.name,
    kind: asKind(row.kind),
    market: row.market_id as Market,
    ownerName: row.owner_name || 'Customer',
    sharedAt: row.shared_at,
    mine: row.mine === true,
    collectionId: row.collection_id,
    products: ids.flatMap((id) => byId.get(id) ?? []),
    bought,
  };
}

/**
 * A gift giver marks an item on someone's shared list as bought (or undoes their mark). One giver
 * per item: `409 gift_already_bought` when another got there first; `409 own_list` for the owner.
 */
export async function markSharedGift(db: Db, token: string, productId: string, bought: boolean): Promise<void> {
  if (!isShareToken(token)) throw new DataError('collection_not_found');
  if (typeof productId !== 'string' || !productId) throw new DataError('item_not_found');
  unwrap(await db.rpc('mark_shared_gift', { p_token: token, p_product: productId, p_bought: bought === true }));
}
