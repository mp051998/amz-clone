import type { Market } from './types';

/**
 * Card EMI as amazon.in shows it: on ₹3,000 or more, monthly payments over 3 to 12 months. The
 * 3- and 6-month plans are No Cost EMI (the bank's interest comes off as a discount, so the months
 * add up to the price); longer ones carry the bank's interest, here a typical 16% a year on the
 * reducing balance. Each month is rounded up to the rupee. The US store has no EMI.
 */
export const EMI_MIN_MINOR = 300000;
export const EMI_TENURES = [3, 6, 9, 12] as const;
const NO_COST = new Set<number>([3, 6]);
const BANK_RATE = 0.16;

export interface EmiPlan {
  months: number;
  monthlyMinor: number;
  /** what the months add up to over the price (0 for No Cost EMI) */
  interestMinor: number;
  noCost: boolean;
}

export function emiPlans(market: Market, amountMinor: number): EmiPlan[] {
  if (market !== 'IN' || amountMinor < EMI_MIN_MINOR) return [];
  return EMI_TENURES.map((months) => emiPlan(amountMinor, months));
}

/** One tenure's plan for an amount, minimum or not (an order keeps its plan when items are cancelled). */
export function emiPlan(amountMinor: number, months: number): EmiPlan {
  const r = BANK_RATE / 12;
  const noCost = NO_COST.has(months);
  const exact = noCost ? amountMinor / months : (amountMinor * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  const monthlyMinor = Math.ceil(exact / 100) * 100;
  return { months, monthlyMinor, interestMinor: noCost ? 0 : monthlyMinor * months - amountMinor, noCost };
}

/** An order's plan as its page shows it: "₹1,234/month for 6 months · No Cost EMI". */
export function emiText(amountMinor: number, months: number, money: (minor: number) => string): string {
  const p = emiPlan(amountMinor, months);
  return `${money(p.monthlyMinor)}/month for ${months} months · ${p.noCost ? 'No Cost EMI' : `${money(p.interestMinor)} interest`}`;
}

export function isEmiMonths(v: unknown): v is number {
  return typeof v === 'number' && (EMI_TENURES as readonly number[]).includes(v);
}

/** The lowest monthly payment ("EMI starts at ₹1,234"), or null without EMI. */
export function emiFrom(plans: readonly EmiPlan[]): number | null {
  return plans.length ? Math.min(...plans.map((p) => p.monthlyMinor)) : null;
}
