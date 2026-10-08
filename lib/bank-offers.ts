import type { CartLine } from './types';

/** The payment methods where the shopper names their bank at checkout, so a Bank Offer can apply. */
export type BankOfferMethod = 'netbanking' | 'emi';

/**
 * A Bank Offer, as on amazon.in: "10% Instant Discount up to ₹1,500 on HDFC Bank EMI, on orders of
 * ₹5,000 and above". It comes off the items, after the other discounts, when the order is paid
 * through that bank by one of its methods.
 */
export interface BankOffer {
  id: string;
  bank: string;
  methods: BankOfferMethod[];
  percentOff: number;
  maxOffMinor: number;
  /** what the items must come to, after the other discounts */
  minSpendMinor: number;
  /** when it ends (absent: until withdrawn) */
  endsAt?: string;
}

export function isBankOfferMethod(v: unknown): v is BankOfferMethod {
  return v === 'netbanking' || v === 'emi';
}

/** One unit's part, as the DB works it (private.bank_unit_discount): rounded down, scaled under the cap. */
function unitDiscount(pct: number, paid: number, max: number | null, rawTotal: number): number {
  if (paid <= 0) return 0;
  const raw = Math.floor((paid * pct) / 100);
  if (max === null || rawTotal <= max) return raw;
  return Math.floor((raw * max) / rawTotal);
}

/** What units paid `unitPaidMinor` each (after the other discounts) come to. */
export function paidMinor(lines: readonly { unitPaidMinor: number; qty: number }[]): number {
  return lines.reduce((s, l) => s + l.unitPaidMinor * l.qty, 0);
}

/**
 * What the offer takes off these items, exactly as place_order does: its percentage off each
 * unit, all scaled down together when that passes the cap; 0 under the minimum spend.
 */
export function bankOfferSavings(offer: Pick<BankOffer, 'percentOff' | 'maxOffMinor' | 'minSpendMinor'>, lines: readonly { unitPaidMinor: number; qty: number }[]): number {
  if (paidMinor(lines) < offer.minSpendMinor) return 0;
  const raw = lines.reduce((s, l) => s + unitDiscount(offer.percentOff, l.unitPaidMinor, null, 0) * l.qty, 0);
  return lines.reduce((s, l) => s + unitDiscount(offer.percentOff, l.unitPaidMinor, offer.maxOffMinor, raw) * l.qty, 0);
}

/** The checkout's lines as units paid after coupons, quantity discounts and a promotion code. */
export function paidUnits(lines: readonly Pick<CartLine, 'product' | 'qty' | 'discountMinor'>[]): { unitPaidMinor: number; qty: number }[] {
  return lines.map((l) => ({ unitPaidMinor: l.product.priceMinor - Math.round((l.discountMinor ?? 0) / Math.max(1, l.qty)), qty: l.qty }));
}

/**
 * The offer place_order would apply for this method and bank: the one saving the most (by id on a
 * tie), among those whose minimum the items reach. Null when none does.
 */
export function bestBankOffer(
  offers: readonly BankOffer[],
  method: BankOfferMethod,
  bank: string,
  lines: readonly { unitPaidMinor: number; qty: number }[],
): { offer: BankOffer; savingsMinor: number } | null {
  const paid = paidMinor(lines);
  const ranked = offers
    .filter((o) => o.bank === bank && o.methods.includes(method) && paid >= o.minSpendMinor)
    .map((o) => ({ offer: o, approx: Math.min(Math.floor((paid * o.percentOff) / 100), o.maxOffMinor) }))
    .sort((a, b) => b.approx - a.approx || (a.offer.id < b.offer.id ? -1 : 1));
  const top = ranked[0];
  return top ? { offer: top.offer, savingsMinor: bankOfferSavings(top.offer, lines) } : null;
}

/** The banks a shopper can pick at checkout for net banking and EMI. */
export const CHECKOUT_BANKS = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Yes Bank'] as const;

/**
 * For each method and bank with an offer: the one that applies to these items and what it saves,
 * or, when the items don't reach any of the bank's minimums yet, the one with the lowest minimum
 * (saving 0).
 */
export function bankOfferChoices(
  offers: readonly BankOffer[],
  lines: readonly { unitPaidMinor: number; qty: number }[],
): Partial<Record<BankOfferMethod, Record<string, { offer: BankOffer; savingsMinor: number }>>> {
  const out: Partial<Record<BankOfferMethod, Record<string, { offer: BankOffer; savingsMinor: number }>>> = {};
  for (const o of offers) {
    for (const m of o.methods) {
      const byBank = (out[m] ??= {});
      if (byBank[o.bank]) continue;
      const lowest = offers
        .filter((x) => x.bank === o.bank && x.methods.includes(m))
        .sort((a, b) => a.minSpendMinor - b.minSpendMinor || (a.id < b.id ? -1 : 1))[0];
      byBank[o.bank] = bestBankOffer(offers, m, o.bank, lines) ?? { offer: lowest, savingsMinor: 0 };
    }
  }
  return out;
}

const METHOD_TEXT: Record<BankOfferMethod, string> = { emi: 'EMI', netbanking: 'net banking' };

/** "EMI and net banking" */
export function bankOfferMethodsText(methods: readonly BankOfferMethod[]): string {
  const order: BankOfferMethod[] = ['emi', 'netbanking'];
  return order.filter((m) => methods.includes(m)).map((m) => METHOD_TEXT[m]).join(' and ');
}

/** "10% Instant Discount up to ₹1,500 on HDFC Bank EMI, on orders of ₹5,000 and above" */
export function bankOfferText(offer: BankOffer, money: (minor: number) => string): string {
  const min = offer.minSpendMinor > 0 ? `, on orders of ${money(offer.minSpendMinor)} and above` : '';
  return `${offer.percentOff}% Instant Discount up to ${money(offer.maxOffMinor)} on ${offer.bank} ${bankOfferMethodsText(offer.methods)}${min}`;
}
