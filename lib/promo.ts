/** Promotion codes as typed at checkout: letters and digits, 3–20 of them, any case. */
export const PROMO_CODE_MAX = 20;

/** A typed promotion code, trimmed and upper-cased; null when blank. */
export function readPromoCode(v: unknown): string | null {
  const code = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return code ? code.slice(0, 40) : null;
}

/** Why a promotion code didn't apply, in words; the minimum spend comes formatted with `money`. */
export function promoProblem(code: string, detail: string | undefined, money: (minor: number) => string, fallback: string): string {
  const min = Number(detail);
  if (code === 'promo_min_spend' && Number.isInteger(min) && min > 0) {
    return `Spend ${money(min)} or more on qualifying items to use that promotion code.`;
  }
  return fallback;
}
