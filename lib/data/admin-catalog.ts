import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/client';
import { decisionConfig } from '../decision/attributes';
import { deriveInsight, pricePercentiles } from '../decision/derive';
import { DETAIL_LIMITS, toDetailRows, type DetailRow } from '../product-details';
import { CLIMATE_CERTS, climateCerts, type ClimateCert } from '../climate';
import type { Market } from '../types';
import { MEMBER_PCT_MAX } from '../member-deals';
import { QTY_DISCOUNT_MAX_QTY, QTY_DISCOUNT_MIN_QTY, QTY_DISCOUNT_PCT_MAX, type QtyDiscount } from '../qty-discount';
import { isUnitKind, UNIT_KINDS, UNIT_QTY_MAX, type ProductUnit } from '../unit-price';
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
  /** percent off with the product's coupon (5–50), or null for no coupon. */
  couponPct: number | null;
  /** "Limit 3 per customer": the most units one shopper can buy (1–99), or null for no limit. */
  maxPerCustomer: number | null;
  /** the sizes it comes in, in size-chart order (clothes, shoes), or null when it doesn't. */
  sizes: string[] | null;
  /** its Climate Pledge Friendly certifications (none: it isn't); left as they are when not given. */
  climate?: ClimateCert[];
  /** how much it holds (3 fl oz, 150 ml, 30 count), for its unit price; null when it isn't sold by measure. */
  unit: ProductUnit | null;
  /** "Save 5% when you buy 2 or more": percent off (1–50) each unit of a line of at least minQty (2–99), or null for none. */
  qtyDiscount: QtyDiscount | null;
  /** Plus exclusive deal: percent off (1–50) its price for members, or null for none; left as it is when not given. */
  memberPct?: number | null;
  /** when it comes out (ISO; the store's midnight that day): sold as a pre-order until then, or null once out. */
  releaseAt: string | null;
  badge: string | null;
  boughtPastMonth: string | null;
  seller: string;
  shipsFrom: string;
  bullets: string[];
  /** the "Product description" paragraph. */
  description: string | null;
  /** the "Product information" table, most important row first. */
  details: DetailRow[];
  stock: number;
  /** more images after the main one, in order (up to 8). */
  gallery: string[];
  /** products of a store sharing this key show as options of each other; null when it has none. */
  variantGroup: string | null;
  /** what the options differ by, e.g. "Color" (the same across a group). */
  variantAxis: string | null;
  /** this product's option, e.g. "Black" (unique within its group). */
  variantLabel: string | null;
}

export const GALLERY_MAX = 8;
/** A coupon's range (coupons_percent_off_check). */
export const COUPON_MIN = 5;
export const COUPON_MAX = 50;
/** A limit per customer's range (products_max_per_customer_check). */
export const LIMIT_MAX = 99;
/** How many sizes a product can come in (products_sizes_check), and how long each can be (cart_items_size_check). */
export const SIZES_MAX = 20;
export const SIZE_LENGTH = 12;
/** Option names the form suggests; any short name works. */
export const VARIANT_AXES = ['Color', 'Size', 'Style', 'Capacity', 'Configuration', 'Pattern', 'Pack size'];

const required = (label: string, max: number) =>
  z.string().trim().min(1, `Enter ${label}`).max(max, `Keep it under ${max} characters`);
const optional = (max: number) =>
  z.string().trim().max(max, `Keep it under ${max} characters`).nullable().transform((v) => v || null);

const IMAGE_URL = /^(\/products\/[A-Za-z0-9._/-]+|https:\/\/\S+)$/;

const ProductInputSchema = z
  .object({
    title: required('a title', 300),
    brand: optional(80),
    category: z.string().trim().regex(/^[a-z0-9-]+$/, 'Pick a category'),
    image: z
      .string()
      .trim()
      .max(500, 'Keep it under 500 characters')
      .regex(IMAGE_URL, 'Upload an image or paste an https:// image URL'),
    priceMinor: z.number().int('Enter a price').positive('Price must be more than 0').max(100_000_000, 'That price is too high'),
    listMinor: z.number().int().positive().max(100_000_000).nullable(),
    deal: z.boolean(),
    couponPct: z
      .number()
      .int('Enter a whole percent')
      .min(COUPON_MIN, `Coupons are ${COUPON_MIN}% to ${COUPON_MAX}% off`)
      .max(COUPON_MAX, `Coupons are ${COUPON_MIN}% to ${COUPON_MAX}% off`)
      .nullable()
      .default(null),
    maxPerCustomer: z
      .number()
      .int('Enter a whole number')
      .min(1, `Limits are 1 to ${LIMIT_MAX} per customer`)
      .max(LIMIT_MAX, `Limits are 1 to ${LIMIT_MAX} per customer`)
      .nullable()
      .default(null),
    sizes: z
      .array(z.string().trim().min(1, 'Sizes can’t be blank').max(SIZE_LENGTH, `Keep each size to ${SIZE_LENGTH} characters`))
      .min(1, 'Add a size, or leave it blank')
      .max(SIZES_MAX, `Up to ${SIZES_MAX} sizes`)
      .refine((v) => new Set(v).size === v.length, 'List each size once')
      .nullable()
      .default(null),
    // each once, in the order the storefront lists them
    climate: z.array(z.enum(CLIMATE_CERTS, 'Pick from the listed certifications')).optional().transform((v) => (v ? climateCerts(v) : undefined)),
    unit: z
      .object({
        qty: z
          .number()
          .positive('Enter how much it holds, like 3 fl oz')
          .max(UNIT_QTY_MAX, 'That’s more than a product can hold')
          .transform((q) => Math.round(q * 100) / 100)
          .refine((q) => q > 0, 'Enter how much it holds, like 3 fl oz'),
        kind: z.enum(UNIT_KINDS, 'Pick a unit like oz, ml or count'),
      })
      .nullable()
      .default(null),
    qtyDiscount: z
      .object({
        percentOff: z
          .number()
          .int('Enter a whole percent')
          .min(1, `Quantity discounts are 1% to ${QTY_DISCOUNT_PCT_MAX}% off`)
          .max(QTY_DISCOUNT_PCT_MAX, `Quantity discounts are 1% to ${QTY_DISCOUNT_PCT_MAX}% off`),
        minQty: z
          .number()
          .int('Enter a whole number')
          .min(QTY_DISCOUNT_MIN_QTY, `Quantity discounts start at ${QTY_DISCOUNT_MIN_QTY} to ${QTY_DISCOUNT_MAX_QTY} units`)
          .max(QTY_DISCOUNT_MAX_QTY, `Quantity discounts start at ${QTY_DISCOUNT_MIN_QTY} to ${QTY_DISCOUNT_MAX_QTY} units`),
      })
      .nullable()
      .default(null),
    memberPct: z
      .number()
      .int('Enter a whole percent')
      .min(1, `Member deals are 1% to ${MEMBER_PCT_MAX}% off`)
      .max(MEMBER_PCT_MAX, `Member deals are 1% to ${MEMBER_PCT_MAX}% off`)
      .nullable()
      .optional(),
    releaseAt: z.iso.datetime({ offset: true, error: 'Enter the release date' }).nullable().default(null),
    badge: optional(40),
    boughtPastMonth: optional(40),
    seller: required('the seller', 120),
    shipsFrom: required('where it ships from', 120),
    bullets: z.array(z.string().trim().min(1).max(300, 'Keep each point under 300 characters')).max(10, 'Up to 10 points'),
    description: optional(DETAIL_LIMITS.description).default(null),
    details: z
      .array(
        z.tuple([
          z.string().trim().min(1, 'Every row needs a label').max(DETAIL_LIMITS.label, `Keep labels under ${DETAIL_LIMITS.label} characters`),
          z.string().trim().min(1, 'Every row needs a value').max(DETAIL_LIMITS.value, `Keep values under ${DETAIL_LIMITS.value} characters`),
        ]),
      )
      .max(DETAIL_LIMITS.rows, `Up to ${DETAIL_LIMITS.rows} rows`)
      .default([]),
    stock: z.number().int('Enter a whole number').min(0, 'Stock can’t be negative').max(1_000_000, 'That’s a lot of stock'),
    gallery: z
      .array(z.string().trim().max(500, 'Keep image URLs under 500 characters').regex(IMAGE_URL, 'Gallery images need an https:// URL'))
      .max(GALLERY_MAX, `Up to ${GALLERY_MAX} more images`)
      .default([]),
    variantGroup: z
      .string()
      .trim()
      .toLowerCase()
      .max(60, 'Keep it under 60 characters')
      .regex(/^([a-z0-9][a-z0-9-]*)?$/, 'Use lowercase letters, numbers and dashes, e.g. sony-wh-ch520')
      .nullable()
      .default(null)
      .transform((v) => v || null),
    variantAxis: optional(30).default(null),
    variantLabel: optional(60).default(null),
  })
  .transform((v) => ({
    ...v,
    // the main image isn't repeated, nor any image twice
    gallery: [...new Set(v.gallery)].filter((g) => g !== v.image),
    // without a group the option fields mean nothing; with one, the option name defaults to Style
    variantAxis: v.variantGroup ? v.variantAxis ?? 'Style' : null,
    variantLabel: v.variantGroup ? v.variantLabel : null,
  }))
  .superRefine((v, ctx) => {
    if (v.variantGroup && !v.variantLabel) {
      ctx.addIssue({ code: 'custom', path: ['variantLabel'], message: 'Name this product’s option, e.g. Black' });
    }
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
    max_per_customer: p.maxPerCustomer,
    sizes: p.sizes,
    ...(p.climate ? { climate: p.climate } : {}),
    unit_qty: p.unit?.qty ?? null,
    unit_kind: p.unit?.kind ?? null,
    qty_discount_pct: p.qtyDiscount?.percentOff ?? null,
    qty_discount_min: p.qtyDiscount?.minQty ?? null,
    ...(p.memberPct !== undefined ? { member_pct: p.memberPct } : {}),
    release_at: p.releaseAt,
    badge: p.badge,
    bought_past_month: p.boughtPastMonth,
    seller: p.seller,
    ships_from: p.shipsFrom,
    bullets: p.bullets,
    description: p.description,
    details: p.details,
    stock: p.stock,
    gallery: p.gallery,
    variant_group: p.variantGroup,
    variant_axis: p.variantAxis,
    variant_label: p.variantLabel,
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

/** At or below this many units a product on sale is low on stock (the catalogue marks it). */
export const LOW_STOCK = 5;

/** `out`: none left · `low`: 1 to LOW_STOCK left. */
export type StockFilter = 'out' | 'low';

export function stockFilter(v: unknown): StockFilter | undefined {
  return v === 'out' || v === 'low' ? v : undefined;
}

/** A store's products in one status, most recently changed first; `q` matches the title or id. */
export async function listAdminProducts(
  db: Db,
  market: Market,
  opts: { q?: string; category?: string; status?: ProductStatus; stock?: StockFilter; page?: number; pageSize?: number } = {},
): Promise<AdminProductPage> {
  const size = opts.pageSize ?? ADMIN_PAGE_SIZE;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  let q = db.from('products').select(SUMMARY, { count: 'exact' }).eq('market_id', market);
  q = opts.status === 'archived' ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  if (opts.category) q = q.eq('category_slug', opts.category);
  if (opts.stock === 'out') q = q.lte('stock', 0);
  else if (opts.stock === 'low') q = q.gte('stock', 1).lte('stock', LOW_STOCK);
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

/** Products on sale with none left, and with 1 to LOW_STOCK left. */
export async function countAdminStock(db: Db, market: Market): Promise<Record<StockFilter, number>> {
  const base = () => db.from('products').select('id', { count: 'exact', head: true }).eq('market_id', market).is('archived_at', null);
  const [out, low] = await Promise.all([base().lte('stock', 0), base().gte('stock', 1).lte('stock', LOW_STOCK)]);
  if (out.error) throw fromPostgrest(out.error);
  if (low.error) throw fromPostgrest(low.error);
  return { out: out.count ?? 0, low: low.count ?? 0 };
}

export interface AdminProduct extends ProductInput {
  id: string;
  market: Market;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export async function getAdminProduct(db: Db, id: string): Promise<AdminProduct | null> {
  const [r, coupon] = await Promise.all([
    db.from('products').select('*').eq('id', id).maybeSingle().then(unwrap),
    // before the coupons migration there are none
    db.from('coupons').select('percent_off').eq('product_id', id).maybeSingle(),
  ]);
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
    couponPct: coupon.error ? null : coupon.data?.percent_off ?? null,
    // absent before the purchase limits migration
    maxPerCustomer: r.max_per_customer ?? null,
    // absent before the sizes migration
    sizes: r.sizes ?? null,
    // absent before the Climate Pledge Friendly migration
    climate: climateCerts(r.climate),
    // absent before the unit price migration
    unit: r.unit_qty != null && isUnitKind(r.unit_kind) ? { qty: Number(r.unit_qty), kind: r.unit_kind } : null,
    // absent before the quantity discounts migration
    qtyDiscount: r.qty_discount_pct && r.qty_discount_min ? { percentOff: r.qty_discount_pct, minQty: r.qty_discount_min } : null,
    // absent before the Plus exclusive deals migration
    memberPct: r.member_pct ?? null,
    // absent before the pre-orders migration
    releaseAt: r.release_at ?? null,
    badge: r.badge,
    boughtPastMonth: r.bought_past_month,
    seller: r.seller,
    shipsFrom: r.ships_from,
    bullets: r.bullets,
    description: r.description,
    details: toDetailRows(r.details),
    stock: r.stock,
    gallery: r.gallery ?? [],
    variantGroup: r.variant_group ?? null,
    variantAxis: r.variant_axis ?? null,
    variantLabel: r.variant_label ?? null,
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
  const p = await checkVariantGroup(db, market, null, parse(input));
  const last = unwrap(
    await db.from('products').select('position').eq('market_id', market).order('position', { ascending: false }).limit(1).maybeSingle(),
  );
  const id = newProductId(market);
  const res = await db
    .from('products')
    .insert({ id, market_id: market, position: (last?.position ?? -1) + 1, ...toRow(p) })
    .select('id')
    .single();
  if (res.error) throw writeError(res.error);
  await setCoupon(db, res.data.id, p.couponPct);
  await refreshInsight(db, res.data.id, true);
  return res.data.id;
}

/**
 * Replace a product's editable fields (its id and store never change). A new category or new
 * wording re-derives its rules insight (see `refreshInsight`).
 */
export async function updateProduct(db: Db, id: string, input: unknown): Promise<void> {
  const before = unwrap(await db.from('products').select('market_id, category_slug, title, brand, bullets').eq('id', id).maybeSingle());
  // RLS hides the row from non-admins, so "no row" is either missing or not allowed
  if (!before) throw new DataError('product_not_found');
  const p = await checkVariantGroup(db, before.market_id as Market, id, parse(input));
  const updated = await db.from('products').update(toRow(p)).eq('id', id).select('id').maybeSingle();
  if (updated.error) throw writeError(updated.error);
  if (!updated.data) throw new DataError('product_not_found');
  await setCoupon(db, id, p.couponPct);
  const moved = before.category_slug !== p.category;
  const reworded = before.title !== p.title || before.brand !== p.brand || before.bullets.join('\n') !== p.bullets.join('\n');
  if (moved || reworded) await refreshInsight(db, id, moved);
}

/** Give a product its coupon, change its percent, or (null) take it away. Shoppers' clips go with it. */
async function setCoupon(db: Db, productId: string, pct: number | null): Promise<void> {
  const res = pct == null
    ? await db.from('coupons').delete().eq('product_id', productId)
    : await db.from('coupons').upsert({ product_id: productId, percent_off: pct }, { onConflict: 'product_id' });
  if (res.error) throw fromPostgrest(res.error);
}

/**
 * A group's option name is shared: joining a group means using its name (Color, Size, …), spelled
 * as the group already does. Labels are unique per group (products_variant_label_key), checked
 * here for a clear message too. Returns the input with the group's spelling.
 */
async function checkVariantGroup(db: Db, market: Market, id: string | null, p: ProductInput): Promise<ProductInput> {
  if (!p.variantGroup) return p;
  let q = db.from('products').select('id, variant_axis, variant_label').eq('market_id', market).eq('variant_group', p.variantGroup);
  if (id) q = q.neq('id', id);
  const others = unwrap(await q);
  const axis = others.find((o) => o.variant_axis)?.variant_axis;
  if (axis && axis.toLowerCase() !== p.variantAxis?.toLowerCase()) {
    throw new DataError('invalid_input', 'variantAxis', `Products in this group use “${axis}”`);
  }
  if (others.some((o) => o.variant_label?.toLowerCase() === p.variantLabel?.toLowerCase())) {
    throw new DataError('invalid_input', 'variantLabel', 'Another product in this group already uses that option');
  }
  return axis ? { ...p, variantAxis: axis } : p;
}

/** A failed product write: a duplicate option label (a race past the check) reads as a field error. */
function writeError(err: { code?: string; message: string; details?: string | null }): DataError {
  if (err.code === '23505' && /products_variant_label_key/.test(err.message)) {
    return new DataError('invalid_input', 'variantLabel', 'Another product in this group already uses that option');
  }
  return fromPostgrest(err as Parameters<typeof fromPostgrest>[0]);
}

/** A store's variant groups with their option name and size, for the product form's suggestions. */
export async function listVariantGroups(db: Db, market: Market): Promise<{ group: string; axis: string; count: number }[]> {
  const res = await db.from('products').select('variant_group, variant_axis').eq('market_id', market).not('variant_group', 'is', null);
  if (res.error) return []; // suggestions only (or the columns aren't deployed yet)
  const groups = new Map<string, { group: string; axis: string; count: number }>();
  for (const r of res.data) {
    const g = groups.get(r.variant_group!) ?? { group: r.variant_group!, axis: r.variant_axis ?? 'Style', count: 0 };
    g.count += 1;
    groups.set(g.group, g);
  }
  return [...groups.values()].sort((a, b) => a.group.localeCompare(b.group));
}

/** The other products in a variant group (archived ones too; the storefront hides those). */
export async function listVariantSiblings(
  db: Db,
  market: Market,
  group: string,
  exceptId: string,
): Promise<{ id: string; title: string; label: string; archived: boolean }[]> {
  const rows = unwrap(
    await db.from('products').select('id, title, variant_label, archived_at').eq('market_id', market).eq('variant_group', group).neq('id', exceptId),
  );
  const byLabel = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  return rows
    .map((r) => ({ id: r.id, title: r.title, label: r.variant_label ?? '', archived: r.archived_at != null }))
    .sort((a, b) => byLabel.compare(a.label, b.label));
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

/** Why an image file can't be used (type or size), or null when it can. */
export function imageFileError(file: File): string | null {
  if (!IMAGE_TYPES[file.type]) return 'Use a JPEG, PNG or WebP image';
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return 'Images can be up to 3 MB';
  return null;
}

/** Store an uploaded image in the public product-images bucket; returns its public URL. */
export async function uploadProductImage(db: Db, market: Market, file: File, field: 'image' | 'gallery' = 'image'): Promise<string> {
  const bad = imageFileError(file);
  if (bad) throw new DataError('invalid_input', field, bad);
  const ext = IMAGE_TYPES[file.type];
  const path = `${market.toLowerCase()}/${randomBytes(12).toString('hex')}.${ext}`;
  const bucket = db.storage.from(PRODUCT_IMAGE_BUCKET);
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    if (/row-level security|unauthorized/i.test(error.message)) throw new DataError('forbidden', field);
    throw new DataError('invalid_input', field, 'The image could not be uploaded. Try again, or paste an image URL.');
  }
  return bucket.getPublicUrl(path).data.publicUrl;
}
