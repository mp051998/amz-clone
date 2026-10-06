import { AddressInputSchema, type AddressInput } from '../contracts';
import type { Db } from '../db/client';
import type { Address, Market } from '../types';
import { DataError, unwrap } from './errors';
import { toAddress } from './map';

/** Loose address fields as a form or API client sends them. */
export interface AddressFieldsInput {
  fullName?: unknown;
  phone?: unknown;
  line1?: unknown;
  line2?: unknown;
  landmark?: unknown;
  city?: unknown;
  state?: unknown;
  postcode?: unknown;
  addressType?: unknown;
  instructions?: unknown;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** digits only, dropping a leading country code (+1 / +91) when present. */
function normalisePhone(raw: string, market: Market): string {
  const digits = raw.replace(/\D/g, '');
  if (market === 'US' && digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (market === 'IN' && digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

/** Validate with the shared per-store contract (US vs IN schema). Throws invalid_input with the first issue. */
export function parseAddress(market: Market, input: AddressFieldsInput): AddressInput {
  const res = AddressInputSchema.safeParse({
    schema: market,
    fullName: str(input.fullName),
    phone: normalisePhone(str(input.phone), market),
    line1: str(input.line1),
    line2: str(input.line2).trim() || undefined,
    landmark: str(input.landmark).trim() || undefined,
    city: str(input.city),
    state: market === 'US' ? str(input.state).trim().toUpperCase() : str(input.state),
    postcode: str(input.postcode),
    addressType: market === 'IN' ? (str(input.addressType) === 'office' ? 'office' : 'home') : undefined,
    // a textarea posts line breaks as \r\n; count them as one character, as its maxLength does
    instructions: str(input.instructions).replace(/\r\n?/g, '\n').trim() || undefined,
  });
  if (!res.success) {
    const issue = res.error.issues[0];
    throw new DataError('invalid_input', issue?.path.join('.'), issue?.message);
  }
  return res.data;
}

function toRow(market: Market, a: AddressInput) {
  return {
    market_id: market,
    full_name: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 || null,
    landmark: a.schema === 'IN' ? a.landmark || null : null,
    city: a.city,
    state: a.state,
    postcode: a.postcode,
    kind: a.schema === 'IN' ? a.addressType ?? 'home' : null,
    instructions: a.instructions || null,
  };
}

export async function listAddresses(db: Db, market: Market): Promise<Address[]> {
  const rows = unwrap(
    await db.from('addresses').select('*').eq('market_id', market).order('is_default', { ascending: false }).order('created_at'),
  );
  return rows.map(toAddress);
}

export async function getAddress(db: Db, market: Market, id: string): Promise<Address | null> {
  const row = unwrap(await db.from('addresses').select('*').eq('market_id', market).eq('id', id).maybeSingle());
  return row ? toAddress(row) : null;
}

/** The address to prefill checkout with: the default (the DB keeps exactly one when any exist). */
export async function getDefaultAddress(db: Db, market: Market): Promise<Address | null> {
  const list = await listAddresses(db, market);
  return list.find((a) => a.isDefault) ?? list[0] ?? null;
}

export async function createAddress(db: Db, market: Market, input: AddressFieldsInput, makeDefault = false): Promise<Address> {
  const row = { ...toRow(market, parseAddress(market, input)), is_default: makeDefault };
  return toAddress(unwrap(await db.from('addresses').insert(row).select('*').single()));
}

export async function updateAddress(
  db: Db,
  market: Market,
  id: string,
  input: AddressFieldsInput,
  makeDefault = false,
): Promise<Address> {
  const row = { ...toRow(market, parseAddress(market, input)), ...(makeDefault ? { is_default: true } : {}) };
  const updated = unwrap(await db.from('addresses').update(row).eq('id', id).eq('market_id', market).select('*').maybeSingle());
  if (!updated) throw new DataError('address_not_found');
  return toAddress(updated);
}

export async function setDefaultAddress(db: Db, market: Market, id: string): Promise<Address> {
  const updated = unwrap(
    await db.from('addresses').update({ is_default: true }).eq('id', id).eq('market_id', market).select('*').maybeSingle(),
  );
  if (!updated) throw new DataError('address_not_found');
  return toAddress(updated);
}

export async function deleteAddress(db: Db, market: Market, id: string): Promise<void> {
  const deleted = unwrap(await db.from('addresses').delete().eq('id', id).eq('market_id', market).select('id'));
  if (!deleted.length) throw new DataError('address_not_found');
}
