import type { CurrencyCode } from './contracts';

/**
 * Unit pricing, as Amazon shows beside a price: "$19.66 ($6.55 / Fl Oz)", "₹275 (₹275.00 / 100 ml)".
 * A product says how much it holds (products.unit_qty / unit_kind); the unit price is its price
 * over that, per the kind's base (one ounce, 100 ml, …).
 */

/** What a product's quantity is counted in (products_unit_kind_check). */
export const UNIT_KINDS = ['count', 'oz', 'fl_oz', 'lb', 'g', 'kg', 'ml', 'l'] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export interface ProductUnit {
  /** how much the product holds, up to 2 decimals (3 fl oz, 150 ml, 30 count). */
  qty: number;
  kind: UnitKind;
}

/** The most a product can hold (products_unit_qty_check). */
export const UNIT_QTY_MAX = 100_000;

/** Per how much of each kind the price is shown, and how that's written. */
const BASE: Record<UnitKind, { per: number; label: string; short: string }> = {
  count: { per: 1, label: 'Count', short: 'count' },
  oz: { per: 1, label: 'Ounce', short: 'oz' },
  fl_oz: { per: 1, label: 'Fl Oz', short: 'fl oz' },
  lb: { per: 1, label: 'Pound', short: 'lb' },
  g: { per: 100, label: '100 g', short: 'g' },
  kg: { per: 1, label: 'kg', short: 'kg' },
  ml: { per: 100, label: '100 ml', short: 'ml' },
  l: { per: 1, label: 'l', short: 'l' },
};

const ALIASES: [RegExp, UnitKind][] = [
  [/^(count|ct|pack|pk|pcs?|pieces?|units?)$/, 'count'],
  [/^(fl\.? ?oz\.?|fluid ounces?)$/, 'fl_oz'],
  [/^(oz\.?|ounces?)$/, 'oz'],
  [/^(lbs?\.?|pounds?)$/, 'lb'],
  [/^(g|gm|gms|grams?)$/, 'g'],
  [/^(kg|kgs|kilograms?)$/, 'kg'],
  [/^(ml|millilit(re|er)s?)$/, 'ml'],
  [/^(l|ltr|lit(re|er)s?)$/, 'l'],
];

export function isUnitKind(v: unknown): v is UnitKind {
  return typeof v === 'string' && (UNIT_KINDS as readonly string[]).includes(v);
}

/** "3 fl oz", "150ml", "30 count" → { qty, kind }; null when it isn't a quantity and unit. */
export function parseUnitSize(text: string): ProductUnit | null {
  const m = /^(\d+(?:\.\d+)?)\s*([a-z][a-z. ]*)$/.exec(text.trim().toLowerCase().replace(/\s+/g, ' '));
  if (!m) return null;
  const qty = Math.round(Number(m[1]) * 100) / 100;
  const kind = ALIASES.find(([re]) => re.test(m[2].trim()))?.[1];
  return kind && qty > 0 && qty <= UNIT_QTY_MAX ? { qty, kind } : null;
}

/** { 3, fl_oz } → "3 fl oz" (the admin form's text, and the product information row). */
export function unitSizeText(unit: ProductUnit): string {
  return `${unit.qty} ${BASE[unit.kind].short}`;
}

/** The price per the kind's base, in minor units (rounded to the cent / paisa). */
export function unitPriceMinor(priceMinor: number, unit: ProductUnit): number {
  return Math.round((priceMinor * BASE[unit.kind].per) / unit.qty);
}

const LOCALE: Record<CurrencyCode, string> = { USD: 'en-US', INR: 'en-IN' };

/** "$6.55 / Fl Oz", "₹275.00 / 100 ml": always to the cent, as Amazon writes it. */
export function unitPriceText(priceMinor: number, currency: CurrencyCode, unit: ProductUnit): string {
  const money = new Intl.NumberFormat(LOCALE[currency], { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${money.format(unitPriceMinor(priceMinor, unit) / 100)} / ${BASE[unit.kind].label}`;
}
