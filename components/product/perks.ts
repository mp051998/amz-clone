import { COD_MAX_MINOR } from '@/lib/cod';

/** The "Ships from" of items the store's own network packs and delivers, whoever sells them. */
export const STORE_FULFILLER = 'Amazon';

/** A row of amazon.in's returns table: what a return for this reason gets, within what window. */
export interface ReturnRule { reason: string; period: string; policy: string }

/** One of amazon.in's icons under the price, with what it means for this item. */
export interface Perk {
  key: 'delivery' | 'cod' | 'returns' | 'fulfilled' | 'secure';
  /** "Pay on Delivery" */
  label: string;
  /** what a tap on it explains */
  detail: string;
  /** the returns perk's table, by reason */
  rules?: ReturnRule[];
  /** the returns perk's "Return instructions" */
  instructions?: string;
  /** a link to read more */
  more?: { label: string; href: string };
}

export interface PerkInput {
  priceMinor: number;
  /** the store's free-delivery threshold */
  freeThresholdMinor: number;
  /** the shopper's membership name when they have one ("Plus"), which delivers everything free */
  member?: string;
  /** the store takes Pay on Delivery */
  cod: boolean;
  /** the item's return window in days (0: can't be returned) */
  returnDays: number;
  /** comes back only as a replacement (amazon.in's "7 days Replacement") */
  replacementOnly: boolean;
  /** comes in sizes, so one that doesn't fit can go back for another size */
  sized?: boolean;
  /** the store's returns policy page */
  policyHref: string;
  /** who ships it (the product's "Ships from") */
  shipsFrom: string;
  money: (minor: number) => string;
}

/**
 * amazon.in's row of icons under the price: Free Delivery (when this item gets it), Pay on Delivery
 * (up to the ₹50,000 ceiling), its return or replacement window, Amazon Delivered (when the store's
 * own network ships it) and Secure transaction.
 */
export function productPerks(x: PerkInput): Perk[] {
  const perks: Perk[] = [];
  if (x.member || x.priceMinor >= x.freeThresholdMinor) {
    perks.push({
      key: 'delivery',
      label: 'Free Delivery',
      detail: x.member
        ? `Free delivery with your ${x.member} membership, on standard and faster delivery.`
        : `Free standard delivery on this item, as on any order of ${x.money(x.freeThresholdMinor)} or more.`,
    });
  }
  if (x.cod && x.priceMinor <= COD_MAX_MINOR) {
    perks.push({
      key: 'cod',
      label: 'Pay on Delivery',
      detail: `Pay by cash, UPI or card when it arrives, on orders of up to ${x.money(COD_MAX_MINOR)}.`,
    });
  }
  perks.push(x.returnDays === 0 ? { key: 'returns', label: 'Non-Returnable', detail: 'This item can’t be returned once it’s delivered.' } : returnsPerk(x));
  if (x.shipsFrom === STORE_FULFILLER) {
    perks.push({
      key: 'fulfilled',
      label: `${STORE_FULFILLER} Delivered`,
      detail: `${STORE_FULFILLER} packs, ships and delivers this item itself, whoever sells it, with tracking to your door.`,
    });
  }
  perks.push({ key: 'secure', label: 'Secure transaction', detail: 'Your payment is encrypted, and your card details aren’t shared with sellers.' });
  return perks;
}

/** The reasons the store got it wrong (a replacement is offered for these). */
const FAULT = 'Damaged, defective, wrong, not as described or missing parts';

/**
 * amazon.in's returnable / replacement perk: its window, then a table of what each kind of reason
 * gets (the same rules the return form applies), how to hand it back and the full policy.
 */
function returnsPerk(x: PerkInput): Perk {
  const period = `${x.returnDays} days from delivery`;
  const common = {
    key: 'returns' as const,
    instructions: 'Keep the item in its original condition and packaging, with its tags and accessories, for a smooth pick-up or drop-off.',
    more: { label: 'Read full returns policy', href: x.policyHref },
  };
  if (x.replacementOnly) {
    return {
      ...common,
      label: `${x.returnDays} days Replacement`,
      detail: `If it arrives damaged or defective, doesn’t work, isn’t what you ordered or isn’t as described, it’s replaced within ${x.returnDays} days of delivery (refunded only when it can’t be).`,
      rules: [{ reason: FAULT, period, policy: 'Replacement, or a refund when it can’t be replaced' }],
    };
  }
  return {
    ...common,
    label: `${x.returnDays} days Returnable`,
    detail: `Return it within ${x.returnDays} days of delivery for a full refund.`,
    rules: [
      { reason: FAULT, period, policy: 'Full refund or replacement' },
      ...(x.sized ? [{ reason: 'Too small or too large', period, policy: 'Full refund or another size' }] : []),
      { reason: 'Any other reason', period, policy: 'Full refund' },
    ],
  };
}
