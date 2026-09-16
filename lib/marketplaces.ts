import type { CurrencyCode } from './contracts';

const LOCALE_FOR_CURRENCY: Record<CurrencyCode, string> = { USD: 'en-US', INR: 'en-IN' };
const FRACTION_FOR_CURRENCY: Record<CurrencyCode, number> = { USD: 2, INR: 0 };

/** Minor units → store-formatted string. USD: two decimals. INR: whole rupees, Indian grouping. */
export function formatMoney(minor: number, currency: CurrencyCode, locale = LOCALE_FOR_CURRENCY[currency]): string {
  const fraction = FRACTION_FOR_CURRENCY[currency];
  const amount = fraction === 0 ? Math.round(minor / 100) : minor / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(amount);
}

/** Split a minor amount into the pieces the Price component renders (symbol, whole, fraction). */
export function splitMoney(minor: number, currency: CurrencyCode): { symbol: string; whole: string; fraction: string | null } {
  const locale = LOCALE_FOR_CURRENCY[currency];
  const fractionDigits = FRACTION_FOR_CURRENCY[currency];
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).formatToParts(minor / 100);
  const symbol = parts.find((p) => p.type === 'currency')?.value ?? '';
  const whole = parts.filter((p) => p.type === 'integer' || p.type === 'group').map((p) => p.value).join('');
  const fraction = parts.find((p) => p.type === 'fraction')?.value ?? null;
  return { symbol, whole, fraction };
}

/** "Thursday, September 24" — the delivery promise date. */
export function formatPromiseDate(date: Date, cfg: { dates: { timeZone: string }; locale: { default: string } }): string {
  return new Intl.DateTimeFormat(cfg.locale.default, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: cfg.dates.timeZone,
  }).format(date);
}
