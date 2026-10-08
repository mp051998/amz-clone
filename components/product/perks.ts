import { COD_MAX_MINOR } from '@/lib/cod';

/** One of amazon.in's icons under the price, with what it means for this item. */
export interface Perk {
  key: 'delivery' | 'cod' | 'returns' | 'secure';
  /** "Pay on Delivery" */
  label: string;
  /** what a tap on it explains */
  detail: string;
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
  money: (minor: number) => string;
}

/**
 * amazon.in's row of icons under the price: Free Delivery (when this item gets it), Pay on Delivery
 * (up to the ₹50,000 ceiling), its return or replacement window, and Secure transaction.
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
  perks.push(
    x.returnDays === 0
      ? { key: 'returns', label: 'Non-Returnable', detail: 'This item can’t be returned once it’s delivered.' }
      : x.replacementOnly
        ? {
            key: 'returns',
            label: `${x.returnDays} days Replacement`,
            detail: `If it arrives damaged or defective, doesn’t work, isn’t what you ordered or isn’t as described, it’s replaced within ${x.returnDays} days of delivery (refunded only when it can’t be).`,
          }
        : { key: 'returns', label: `${x.returnDays} days Returnable`, detail: `Return it within ${x.returnDays} days of delivery for a full refund.` },
  );
  perks.push({ key: 'secure', label: 'Secure transaction', detail: 'Your payment is encrypted, and your card details aren’t shared with sellers.' });
  return perks;
}
