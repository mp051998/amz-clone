import type { Market } from './types';

/**
 * Plus plans each store sells (a demo: nothing is billed). The database keeps the same list in
 * markets.plus_plans and refuses a plan its store doesn't sell; the prices are shown only.
 */
export type PlusPlanId = 'monthly' | 'quarterly' | 'annual';

export interface PlusPlan {
  id: PlusPlanId;
  name: string;
  /** e.g. "Annual plan" */
  long: string;
  price: string;
  per: string;
  note: string;
  best?: boolean;
}

export const PLUS_PLANS: Record<Market, PlusPlan[]> = {
  US: [
    { id: 'monthly', name: 'Monthly', long: 'Monthly plan', price: '$14.99', per: '/month', note: 'Billed every month. Cancel anytime.' },
    { id: 'annual', name: 'Annual', long: 'Annual plan', price: '$139', per: '/year', note: 'Just $11.58 a month — the lowest monthly cost.', best: true },
  ],
  IN: [
    { id: 'monthly', name: 'Monthly', long: 'Monthly plan', price: '₹299', per: '/month', note: 'Billed every month. Cancel anytime.' },
    { id: 'quarterly', name: '3 months', long: '3-month plan', price: '₹599', per: '/3 months', note: 'Works out to about ₹200 a month.' },
    { id: 'annual', name: 'Annual', long: 'Annual plan', price: '₹1,499', per: '/year', note: 'About ₹125 a month — the lowest monthly cost.', best: true },
  ],
};

export function isPlusPlanId(v: unknown): v is PlusPlanId {
  return v === 'monthly' || v === 'quarterly' || v === 'annual';
}

/** "Annual plan", "3-month plan", "Monthly plan": the same in every store. */
export function planLongName(id: PlusPlanId): string {
  return id === 'annual' ? 'Annual plan' : id === 'quarterly' ? '3-month plan' : 'Monthly plan';
}

/** A store's plan by id (undefined when the store doesn't sell it). */
export function plusPlan(market: Market, id: PlusPlanId): PlusPlan | undefined {
  return PLUS_PLANS[market].find((p) => p.id === id);
}
