import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/client';
import { decisionConfig } from '../decision/attributes';
import { deriveInsight, pricePercentiles } from '../decision/derive';
import type { Market } from '../types';
import { getProduct } from './catalog';
import { DataError, fromPostgrest, unwrap } from './errors';
import { upsertInsight } from './insights';

/**
 * Catalog management for store admins (/admin, /api/v1/admin). Every write runs with the caller's
 * client, so the database decides: products and product-images only accept writes from users in
 * public.admins (supabase/migrations/20260929090000_admin.sql). Non-admins get `forbidden`.
 * Products are archived rather than deleted once ordered (20260930090000_catalog_admin.sql).
 */

export const PRODUCT_IMAGE_BUCKET = 'product-images';
export const PRODUCT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Badges the storefront already shows; the first three also drive "featured" ordering. */
export const PRODUCT_BADGES = ["Amazon's Choice", 'Best Seller', 'Overall Pick', 'Bestseller', 'Limited time deal'];

export async function isAdmin(db: Db): Promise<boolean> {
  const { data, error } = await db.rpc('is_admin');
  return !error && data === true;
}

export async function requireAdmin(db: Db): Promise<void> {
  if (!(await isAdmin(db))) throw new DataError('forbidden');
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ProductInput {
  title: string;
  brand: string | null;
  /** category slug; must be one this product's store carries. */
  category: string;
  /** site path (/products/…) or an https URL (uploaded images are public Storage URLs). */
  image: string;
  priceMinor: number;
  /** "was" price; when set, the discount % is derived from it. */
  listMinor: number | null;
  /** list it on Today's Deals (needs a list price). */
  deal: boolean;
  badge: string | null;
  boughtPastMonth: string | null;
  seller: string;
  shipsFrom: string;
  bullets: string[];
  stock: number;
}

const required = (label: string, max: number) =>
  z.string().trim().min(1, `Enter ${label}`).max(max, `Keep it under ${max} characters`);
const optional = (max: number) =>
  z.string().trim().max(max, `Keep it under ${max} characters`).nullable().transform((v) => v || null);

const ProductInputSchema = z
  .object({
    title: required('a title', 300),
    brand: optional(80),
    category: z.string().trim().regex(/^[a-z0-9-]+$/, 'Pick a category'),
    image: z
      .string()
      .trim()
      .max(500, 'Keep it under 500 characters')
      .regex(/^(\/products\/[A-Za-z0-9._/-]+|https:\/\/\S+)$/, 'Upload an image or paste an https:// image URL'),
    priceMinor: z.number().int('Enter a price').positive('Price must be more than 0').max(100_000_000, 'That price is too high'),
    listMinor: z.number().int().positive().max(100_000_000).nullable(),
    deal: z.boolean(),
    badge: optional(40),
    boughtPastMonth: optional(40),
    seller: required('the seller', 120),
    shipsFrom: required('where it ships from', 120),
    bullets: z.array(z.string().trim().min(1).max(300, 'Keep each point under 300 characters')).max(10, 'Up to 10 points'),
    stock: z.number().int('Enter a whole number').min(0, 'Stock can’t be negative').max(1_000_000, 'That’s a lot of stock'),
  })
  .superRefine((v, ctx) => {
    if (v.listMinor != null && v.listMinor <= v.priceMinor) {
      ctx.addIssue({ code: 'custom', path: ['listMinor'], message: 'The list price must be higher than the price' });
    }
    if (v.deal && v.listMinor == null) {
      ctx.addIssue({ code: 'custom', path: ['deal'], message: 'Add a list price to show it as a deal' });
    }
  });

export type ProductFieldErrors = Partial<Record<keyof ProductInput, string>>;

/** Validate a product; every problem is reported (first message per field). */
export function validateProduct(input: unknown): { ok: true; data: ProductInput } | { ok: false; errors: ProductFieldErrors } {
  const res = ProductInputSchema.safeParse(input);
  if (res.success) return { ok: true, data: res.data };
  const errors: ProductFieldErrors = {};
  for (const issue of res.error.issues) {
    const key = issue.path[0] as keyof ProductInput;
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

function parse(input: unknown): ProductInput {
  const res = validateProduct(input);
  if (res.ok) return res.data;
  const [field, message] = Object.entries(res.errors)[0];
  throw new DataError('invalid_input', field, message);
}

/** "19.99" / "1,299" → minor units (both stores price in 1/100ths); null when blank or not a price. */
export function toMinor(text: string): number | null {
  const clean = text.replace(/[,\s$₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Discount % shown on the card, from the list price. */
export function dealPct(priceMinor: number, listMinor: number | null): number | null {
  if (listMinor == null || listMinor <= priceMinor) return null;
  return Math.min(99, Math.max(1, Math.round(((listMinor - priceMinor) / listMinor) * 100)));
}

function toRow(p: ProductInput) {
  return {
    category_slug: p.category,
    title: p.title,
    brand: p.brand,
    image: p.image,
    price_minor: p.priceMinor,
    list_minor: p.listMinor,
    deal_pct: dealPct(p.priceMinor, p.listMinor),
    deal: p.deal,
    badge: p.badge,
    bought_past_month: p.boughtPastMonth,
    seller: p.seller,
    ships_from: p.shipsFrom,
    bullets: p.bullets,
    stock: p.stock,
  };
}

/** Same shape as the seeded ids: letters/digits, `in-` prefix for the India store. */
export function newProductId(market: Market): string {
  const id = randomBytes(8).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).padEnd(10, '0');
  return market === 'IN' ? `in-n${id}` : `n${id}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface AdminProductSummary {
  id: string;
  title: string;
  brand: string | null;
  image: string;
  category: string;
  categoryName: string;
  priceMinor: number;
  listMinor: number | null;
  deal: boolean;
  stock: number;
  updatedAt: string;
  /** when it was taken off sale; null while on sale. */
  archivedAt: string | null;
}

export interface AdminProductPage {
  items: AdminProductSummary[];
  total: number;
  page: number;
  pageCount: number;
}

export const ADMIN_PAGE_SIZE = 25;

const SUMMARY = 'id, title, brand, image, category_slug, price_minor, list_minor, deal, stock, updated_at, archived_at, categories(name)';

/** On sale, or taken off sale (archived). */
export type ProductStatus = 'active' | 'archived';

export function productStatus(v: string | null | undefined): ProductStatus {
  return v === 'archived' ? 'archived' : 'active';
}

/** A store's products in one status, most recently changed first; `q` matches the title or id. */
export async function listAdminProducts(
  db: Db,
  market: Market,
  opts: { q?: string; category?: string; status?: ProductStatus; page?: number; pageSize?: number } = {},
): Promise<AdminProductPage> {
  const size = opts.pageSize ?? ADMIN_PAGE_SIZE;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  let q = db.from('products').select(SUMMARY, { count: 'exact' }).eq('market_id', market);
  q = opts.status === 'archived' ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  if (opts.category) q = q.eq('category_slug', opts.category);
  const term = opts.q?.trim().slice(0, 100);
  if (term) {
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    q = q.or(`title.ilike.${JSON.stringify(like)},id.eq.${JSON.stringify(term)}`);
  }
  const { data, count, error } = await q
    .order('updated_at', { ascending: false })
    .order('id')
    .range((page - 1) * size, page * size - 1);
  if (error) throw fromPostgrest(error);
  const total = count ?? 0;
  return {
    items: (data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      brand: r.brand,
      image: r.image,
      category: r.category_slug,
      categoryName: r.categories?.name ?? r.category_slug,
      priceMinor: r.price_minor,
      listMinor: r.list_minor,
      deal: r.deal,
      stock: r.stock,
      updatedAt: r.updated_at,
      archivedAt: r.archived_at,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / size)),
  };
}

/** Products per status in a store (for the Active / Archived tabs). */
export async function countAdminProducts(db: Db, market: Market): Promise<Record<ProductStatus, number>> {
  const count = async (status: ProductStatus) => {
    let q = db.from('products').select('id', { count: 'exact', head: true }).eq('market_id', market);
    q = status === 'archived' ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
    const { count: n, error } = await q;
    if (error) throw fromPostgrest(error);
    return n ?? 0;
  };
  const [active, archived] = await Promise.all([count('active'), count('archived')]);
  return { active, archived };
}

export interface AdminProduct extends ProductInput {
  id: string;
  market: Market;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export async function getAdminProduct(db: Db, id: string): Promise<AdminProduct | null> {
  const r = unwrap(await db.from('products').select('*').eq('id', id).maybeSingle());
  if (!r) return null;
  return {
    id: r.id,
    market: r.market_id as Market,
    title: r.title,
    brand: r.brand,
    category: r.category_slug,
    image: r.image,
    priceMinor: r.price_minor,
    listMinor: r.list_minor,
    deal: r.deal,
    badge: r.badge,
    boughtPastMonth: r.bought_past_month,
    seller: r.seller,
    shipsFrom: r.ships_from,
    bullets: r.bullets,
    stock: r.stock,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  };
}

/** Whether any order includes the product (then it can be archived, not deleted). Admins only. */
export async function productHasOrders(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.rpc('product_has_orders', { p_product_id: id });
  if (error) throw fromPostgrest(error);
  return data === true;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Add a product to a store (placed last in catalog order). Returns its id. */
export async function createProduct(db: Db, market: Market, input: unknown): Promise<string> {
  const p = parse(input);
  const last = unwrap(
    await db.from('products').select('position').eq('market_id', market).order('position', { ascending: false }).limit(1).maybeSingle(),
  );
  const id = newProductId(market);
  const res = await db
    .from('products')
    .insert({ id, market_id: market, position: (last?.position ?? -1) + 1, ...toRow(p) })
    .select('id')
    .single();
  if (res.error) throw fromPostgrest(res.error);
  await refreshInsight(db, res.data.id, true);
  return res.data.id;
}

/**
 * Replace a product's editable fields (its id and store never change). A new category or new
 * wording re-derives its rules insight (see `refreshInsight`).
 */
export async function updateProduct(db: Db, id: string, input: unknown): Promise<void> {
  const p = parse(input);
  const before = unwrap(await db.from('products').select('category_slug, title, brand, bullets').eq('id', id).maybeSingle());
  const row = before && unwrap(await db.from('products').update(toRow(p)).eq('id', id).select('id').maybeSingle());
  // RLS hides the row from non-admins, so "no row" is either missing or not allowed
  if (!row) throw new DataError('product_not_found');
  const moved = before.category_slug !== p.category;
  const reworded = before.title !== p.title || before.brand !== p.brand || before.bullets.join('\n') !== p.bullets.join('\n');
  if (moved || reworded) await refreshInsight(db, id, moved);
}

/**
 * Take a product off sale (`archived`) or put it back. Archived products leave every listing and
 * can't be added to carts or saved lists; their page, reviews and order history stay.
 */
export async function setArchived(db: Db, id: string, archived: boolean): Promise<void> {
  const current = await getAdminProduct(db, id);
  if (!current) throw new DataError('product_not_found');
  if ((current.archivedAt != null) === archived) return; // keep the original archive date
  const row = unwrap(
    await db
      .from('products')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id)
      .select('id')
      .maybeSingle(),
  );
  if (!row) throw new DataError('product_not_found');
}

/** Delete a product. Ordered products are kept for order history (`product_has_orders`). */
export async function deleteProduct(db: Db, id: string): Promise<void> {
  const res = await db.from('products').delete().eq('id', id).select('id');
  if (res.error?.code === '23503') throw new DataError('product_has_orders');
  if (res.error) throw fromPostgrest(res.error);
  if (!res.data.length) throw new DataError('product_not_found');
}

/**
 * Re-derive a product's rules insight after an admin save, so its scores use its category's
 * attributes and its current wording. `replaceAi` (a new product, or one moved to another
 * category) also replaces an AI insight, whose attributes would belong to the old category;
 * otherwise only a rules insight (or none) is rewritten. Best effort: the product is already
 * saved, and pages score a product without an insight live from the same rules.
 */
export async function refreshInsight(db: Db, id: string, replaceAi: boolean): Promise<boolean> {
  try {
    const product = await getProduct(db, id, { includeArchived: true });
    if (!product) return false;
    if (!replaceAi) {
      const current = unwrap(await db.from('product_insights').select('source').eq('product_id', id).maybeSingle());
      if (current && current.source !== 'rules') return false;
    }
    // price rank among the store's other products in the category
    const peers = unwrap(
      await db
        .from('products')
        .select('id, price_minor')
        .eq('market_id', product.market)
        .eq('category_slug', product.category)
        .is('archived_at', null),
    );
    const pct = pricePercentiles([
      ...peers.filter((r) => r.id !== id).map((r) => ({ id: r.id, category: product.category, priceMinor: r.price_minor })),
      { id, category: product.category, priceMinor: product.priceMinor },
    ]);
    await upsertInsight(db, deriveInsight(product, decisionConfig(product.category), { pricePercentile: pct.get(id) ?? 0.5 }));
    return true;
  } catch (err) {
    console.warn(`[admin] insight refresh skipped for ${id}:`, (err as Error).message);
    return false;
  }
}

/** Store an uploaded image in the public product-images bucket; returns its public URL. */
export async function uploadProductImage(db: Db, market: Market, file: File): Promise<string> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new DataError('invalid_input', 'image', 'Use a JPEG, PNG or WebP image');
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) throw new DataError('invalid_input', 'image', 'Images can be up to 3 MB');
  const path = `${market.toLowerCase()}/${randomBytes(12).toString('hex')}.${ext}`;
  const bucket = db.storage.from(PRODUCT_IMAGE_BUCKET);
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    if (/row-level security|unauthorized/i.test(error.message)) throw new DataError('forbidden', 'image');
    throw new DataError('invalid_input', 'image', 'The image could not be uploaded. Try again, or paste an image URL.');
  }
  return bucket.getPublicUrl(path).data.publicUrl;
}
