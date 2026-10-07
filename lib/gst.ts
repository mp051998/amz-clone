import { DataError } from './data/errors';

/**
 * GST invoices (amazon.in's "Use GST invoice"): the buyer's GSTIN and business name on an India
 * order. The database checks them too (20261208090000_gst_invoice.sql); this catches a typo
 * before the order is placed.
 */

export const GST_NAME_MAX = 100;

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** A typed GSTIN with spaces dropped, upper-cased. */
export function normalizeGstin(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s/g, '').toUpperCase() : '';
}

/** The check character for a GSTIN's first 14: base-36 values, every second one doubled, quotient and remainder by 36 summed. */
function checkChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** A well-formed GSTIN: state code (01–38, or 97), PAN, entity number, 'Z' and the right check character. */
export function isGstin(v: string): boolean {
  if (!FORMAT.test(v)) return false;
  const state = Number(v.slice(0, 2));
  if (!((state >= 1 && state <= 38) || state === 97)) return false;
  return checkChar(v) === v[14];
}

/**
 * GST details as typed: null when the GSTIN is blank (none, or remove them). `invalid_input`
 * (`gstin` | `gstName`) for a GSTIN that isn't one, or a missing or too-long business name.
 */
export function readGst(gstin: unknown, name: unknown): { gstin: string; name: string } | null {
  const id = normalizeGstin(gstin);
  if (!id) return null;
  if (!isGstin(id)) throw new DataError('invalid_input', 'gstin', 'Enter your 15-character GSTIN as it appears on your GST registration.');
  const business = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '';
  if (!business || business.length > GST_NAME_MAX) {
    throw new DataError('invalid_input', 'gstName', `Enter the business name registered with that GSTIN (up to ${GST_NAME_MAX} characters).`);
  }
  return { gstin: id, name: business };
}
