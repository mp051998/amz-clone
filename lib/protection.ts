import type { Market } from './types';

/**
 * What each store calls the protection plan it sells with eligible items (Amazon's Asurion
 * "2-Year Protection Plan"; amazon.in's extended warranty). The database decides which items have
 * one and prices it (see the protection plans migration).
 */
const PLAN_NAME: Record<Market, string> = {
  US: '2-Year Protection Plan',
  IN: '1-Year Extended Warranty',
};

export function protectionPlanName(market: Market): string {
  return PLAN_NAME[market];
}
