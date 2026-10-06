import { z } from 'zod';
import type { Db } from '../db/client';
import { CONFIGURED_CATEGORIES } from '../decision/attributes';
import { SLUG_MAX, SLUG_RE, slugify } from '../slugify';
import type { Market } from '../types';
import { DataError, fromPostgrest, unwrap } from './errors';

/**
 * Category management for store admins (/admin/categories, /api/v1/admin/categories). A category
 * is shared by both stores; each store chooses whether its nav lists it, and where
 * (market_categories). Writes run with the caller's client and RLS lets only admins through
 * (supabase/migrations/20260930090000_catalog_admin.sql). A slug never changes once created:
 * products, URLs and saved searches key on it.
 */

export const STORES: readonly Market[] = ['US', 'IN'];

export interface CategoryInStore {
  /** place in the store's nav (0 = first); null when the store doesn't list it. */
  position: number | null;
  /** products in this store, archived included. */
  products: number;
  archived: number;
}

export interface AdminCategory {
  slug: string;
  name: string;
  /** the decision tools have attributes, presets and a quiz written for it (else the generic set). */
  tailored: boolean;
  stores: Record<Market, CategoryInStore>;
}

/** Every category with its listing and product counts in each store, by name. */
export async function listAdminCategories(db: Db): Promise<AdminCategory[]> {
  const [cats, listed, counts] = await Promise.all([
    db.from('categories').select('slug, name').order('name'),
    db.from('market_categories').select('market_id, category_slug, position'),
    db.rpc('category_counts'),
  ]);
  const byKey = new Map<string, CategoryInStore>();
  const entry = (market: string, slug: string) => {
    const key = `${market}|${slug}`;
    let e = byKey.get(key);
    if (!e) byKey.set(key, (e = { position: null, products: 0, archived: 0 }));
    return e;
  };
  for (const r of unwrap(listed)) entry(r.market_id, r.category_slug).position = r.position;
  for (const r of unwrap(counts)) Object.assign(entry(r.market_id, r.category_slug), { products: r.products, archived: r.archived });
  return unwrap(cats).map((c) => ({
    slug: c.slug,
    name: c.name,
    tailored: CONFIGURED_CATEGORIES.includes(c.slug),
    stores: Object.fromEntries(STORES.map((m) => [m, entry(m, c.slug)])) as Record<Market, CategoryInStore>,
  }));
}

/** A store's listed categories in nav order. */
export function storeNav(categories: AdminCategory[], market: Market): AdminCategory[] {
  return categories
    .filter((c) => c.stores[market].position != null)
    .sort((a, b) => a.stores[market].position! - b.stores[market].position! || a.slug.localeCompare(b.slug));
}

/** Products in every store, archived included: a category can only be deleted at 0. */
export function totalProducts(c: AdminCategory): number {
  return STORES.reduce((n, m) => n + c.stores[m].products, 0);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const NameSchema = z.string().trim().min(1, 'Enter a name').max(80, 'Keep it under 80 characters');

export interface CategoryInput {
  name: string;
  slug: string;
}

export type CategoryFieldErrors = Partial<Record<keyof CategoryInput, string>>;

/** Validate a new category; a blank slug is derived from the name. */
export function validateCategory(input: { name?: unknown; slug?: unknown }):
  { ok: true; data: CategoryInput } | { ok: false; errors: CategoryFieldErrors } {
  const errors: CategoryFieldErrors = {};
  const name = NameSchema.safeParse(typeof input.name === 'string' ? input.name : '');
  if (!name.success) errors.name = name.error.issues[0].message;
  const given = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : '';
  const slug = given || (name.success ? slugify(name.data) : '');
  if (given || name.success) {
    if (!slug) errors.slug = 'Use letters or numbers in the name, or enter a slug';
    else if (slug.length > SLUG_MAX) errors.slug = `Keep it under ${SLUG_MAX} characters`;
    else if (!SLUG_RE.test(slug)) errors.slug = 'Use lowercase letters, numbers and single hyphens (like home-office)';
  }
  if (!name.success || errors.slug) return { ok: false, errors };
  return { ok: true, data: { name: name.data, slug } };
}

function parseName(name: unknown): string {
  const res = NameSchema.safeParse(typeof name === 'string' ? name : '');
  if (!res.success) throw new DataError('invalid_input', 'name', res.error.issues[0].message);
  return res.data;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Create a category, listed last in `market`'s nav when given. Returns its slug. */
export async function createCategory(db: Db, input: { name?: unknown; slug?: unknown }, market?: Market): Promise<string> {
  const res = validateCategory(input);
  if (!res.ok) {
    const [field, message] = Object.entries(res.errors)[0];
    throw new DataError('invalid_input', field, message);
  }
  const { error } = await db.from('categories').insert(res.data);
  if (error?.code === '23505') throw new DataError('category_exists', 'slug');
  if (error) throw fromPostgrest(error);
  if (market) await addCategoryToStore(db, market, res.data.slug);
  return res.data.slug;
}

export async function renameCategory(db: Db, slug: string, name: unknown): Promise<void> {
  const row = unwrap(await db.from('categories').update({ name: parseName(name) }).eq('slug', slug).select('slug').maybeSingle());
  // RLS hides the row from non-admins, so "no row" is either missing or not allowed
  if (!row) throw new DataError('category_not_found');
}

/** List a category in a store's nav (last); already listed is a no-op. */
export async function addCategoryToStore(db: Db, market: Market, slug: string): Promise<void> {
  const last = unwrap(
    await db.from('market_categories').select('position').eq('market_id', market).order('position', { ascending: false }).limit(1).maybeSingle(),
  );
  const { error } = await db.from('market_categories').insert({ market_id: market, category_slug: slug, position: (last?.position ?? -1) + 1 });
  if (error?.code === '23505') return;
  if (error?.code === '23503') throw new DataError('category_not_found');
  if (error) throw fromPostgrest(error);
}

/** Stop listing a category in a store; `category_in_use` while the store has products in it. */
export async function removeCategoryFromStore(db: Db, market: Market, slug: string): Promise<void> {
  const res = await db.from('market_categories').delete().eq('market_id', market).eq('category_slug', slug).select('category_slug');
  if (res.error) throw fromPostgrest(res.error);
  if (!res.data.length) throw new DataError('category_not_found');
}

/** Move a category up (offset < 0) or down a store's nav. */
export async function moveCategory(db: Db, market: Market, slug: string, offset: number): Promise<void> {
  const { error } = await db.rpc('move_category', { p_market: market, p_slug: slug, p_offset: Math.trunc(offset) });
  if (error) throw fromPostgrest(error);
}

/** Delete a category no product uses (in any store, archived included). */
export async function deleteCategory(db: Db, slug: string): Promise<void> {
  const res = await db.from('categories').delete().eq('slug', slug).select('slug');
  if (res.error?.code === '23503') throw new DataError('category_in_use', slug);
  if (res.error) throw fromPostgrest(res.error);
  if (!res.data.length) throw new DataError('category_not_found');
}
