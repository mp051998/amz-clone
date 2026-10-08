/**
 * Plus exclusive deals, as Amazon's "Prime exclusive deal": a percent off a product's price for the
 * store's members (products.member_pct). It's the member's price, so it comes off first, before a
 * coupon, a quantity discount, a promotion code or a Bank Offer (private.member_unit_discount).
 */

/** A deal's range (products_member_pct_check). */
export const MEMBER_PCT_MAX = 50;

/** What a member's price takes off one unit (0 without a deal), as the database rounds it. */
export function memberUnitOff(pct: number | undefined, priceMinor: number): number {
  return pct ? Math.floor((priceMinor * pct) / 100) : 0;
}

/** The member's price for a product with a deal, else null. */
export function memberPrice(p: { priceMinor: number; memberPct?: number }): number | null {
  return p.memberPct ? p.priceMinor - memberUnitOff(p.memberPct, p.priceMinor) : null;
}

/** "Plus exclusive deal", in the store's membership's name. */
export function memberDealLabel(membership: string): string {
  return `${membership} exclusive deal`;
}
