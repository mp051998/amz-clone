import type { Db } from '../db/client';
import { isExchangeKind, type ExchangeChoice, type ExchangeDevice, type ExchangeKind } from '../exchange';
import type { Market } from '../types';
import { DataError, fromPostgrest, unwrap } from './errors';

/**
 * The models a store takes in exchange, by brand then model (all kinds, or `kind`'s). Anyone reads
 * them; they decorate the product page, so a failed read is none rather than an error.
 */
export async function listExchangeDevices(db: Db, market: Market, kind?: ExchangeKind): Promise<ExchangeDevice[]> {
  let q = db.from('exchange_devices').select('id, kind, brand, model, value_minor').eq('market_id', market).eq('active', true);
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q.order('brand').order('model');
  if (error || !data) return [];
  return data
    .filter((r) => isExchangeKind(r.kind))
    .map((r) => ({ id: r.id, kind: r.kind as ExchangeKind, brand: r.brand, model: r.model, valueMinor: r.value_minor }));
}

/** What a category takes in exchange in a store, if anything (null before the migration, too). */
export async function categoryExchangeKind(db: Db, market: Market, categorySlug: string): Promise<ExchangeKind | null> {
  const { data, error } = await db.from('market_categories').select('exchange_kind').eq('market_id', market).eq('category_slug', categorySlug).maybeSingle();
  if (error || !data) return null;
  return isExchangeKind(data.exchange_kind) ? data.exchange_kind : null;
}

/** A product page's exchange offer: what its category takes in exchange in the store, and the models (null for none). */
export async function exchangeOffer(db: Db, market: Market, categorySlug: string): Promise<{ kind: ExchangeKind; devices: ExchangeDevice[] } | null> {
  const kind = await categoryExchangeKind(db, market, categorySlug);
  if (!kind) return null;
  const devices = await listExchangeDevices(db, market, kind);
  return devices.length ? { kind, devices } : null;
}

/**
 * Set what a category takes in exchange in a store (null: nothing). Only India runs exchange offers
 * (`invalid_input` elsewhere); `category_not_found` when the store doesn't list it (or it isn't an admin).
 */
export async function setCategoryExchangeKind(db: Db, market: Market, slug: string, kind: ExchangeKind | null): Promise<void> {
  if (kind && market !== 'IN') throw new DataError('invalid_input', 'exchange_kind', 'Exchange offers are for the India store.');
  const res = await db.from('market_categories').update({ exchange_kind: kind }).eq('market_id', market).eq('category_slug', slug).select('category_slug');
  if (res.error) throw fromPostgrest(res.error);
  // RLS hides the change from non-admins, so "no row" is either not listed here or not allowed
  if (!res.data.length) throw new DataError('category_not_found');
}

/**
 * What trading `choice` in takes off one unit of the product, and the device's name:
 * `exchange_unavailable` (detail `product` or `device`), `invalid_input` (`exchange`), `product_not_found`.
 */
export async function exchangeQuote(db: Db, market: Market, productId: string, choice: ExchangeChoice): Promise<{ valueMinor: number; device: string }> {
  const json = unwrap(
    await db.rpc('exchange_quote', { p_market: market, p_product: productId, p_device: choice.deviceId, p_condition: choice.condition }),
  ) as { value_minor?: number; device?: string } | null;
  if (!json || typeof json.value_minor !== 'number' || typeof json.device !== 'string') throw new DataError('exchange_unavailable', 'device');
  return { valueMinor: json.value_minor, device: json.device };
}

/** `exchangeKind` for an admin to set from the API: phone, laptop or null (none), else `invalid_input` (exchange_kind). */
export function parseExchangeKind(raw: unknown): ExchangeKind | null {
  if (raw === null || raw === '' || raw === 'none') return null;
  if (!isExchangeKind(raw)) throw new DataError('invalid_input', 'exchange_kind', 'exchangeKind must be phone, laptop or null.');
  return raw;
}
