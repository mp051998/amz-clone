import type { Product, UsedCondition } from './types';

/**
 * Other sellers' offers of a product, as on Amazon: each is new, renewed or used in one of
 * Amazon's grades. Pure — unit-testable.
 */
const LABELS: Record<UsedCondition, string> = {
  renewed: 'Renewed',
  used_like_new: 'Used – Like New',
  used_very_good: 'Used – Very Good',
  used_good: 'Used – Good',
  used_acceptable: 'Used – Acceptable',
};

export function isUsedCondition(v: unknown): v is UsedCondition {
  return typeof v === 'string' && Object.hasOwn(LABELS, v);
}

/** "New", "Renewed" or "Used – Like New". */
export function conditionLabel(c: UsedCondition | undefined): string {
  return c ? LABELS[c] : 'New';
}

/** The groups the offer list filters by. */
export type OfferKind = 'new' | 'renewed' | 'used';
export const OFFER_KINDS: readonly OfferKind[] = ['new', 'renewed', 'used'];
const KIND_NAMES: Record<OfferKind, string> = { new: 'New', renewed: 'Renewed', used: 'Used' };

export function isOfferKind(v: unknown): v is OfferKind {
  return typeof v === 'string' && (OFFER_KINDS as readonly string[]).includes(v);
}

export function offerKind(p: Pick<Product, 'condition'>): OfferKind {
  return !p.condition ? 'new' : p.condition === 'renewed' ? 'renewed' : 'used';
}

export function kindName(k: OfferKind): string {
  return KIND_NAMES[k];
}

export interface OfferSummary {
  /** offers to buy, the product's own included */
  count: number;
  /** the lowest price among them */
  fromMinor: number;
  /** per group present, in New, Renewed, Used order */
  kinds: { kind: OfferKind; count: number; fromMinor: number }[];
}

/** How many ways there are to buy it and from what price ("New & Used (5) from"); null with none. */
export function offerSummary(offers: Pick<Product, 'condition' | 'priceMinor'>[]): OfferSummary | null {
  if (!offers.length) return null;
  const kinds = OFFER_KINDS.map((kind) => {
    const of = offers.filter((o) => offerKind(o) === kind);
    return { kind, count: of.length, fromMinor: Math.min(...of.map((o) => o.priceMinor)) };
  }).filter((k) => k.count > 0);
  return { count: offers.length, fromMinor: Math.min(...offers.map((o) => o.priceMinor)), kinds };
}

/** "New & Used", "New, Renewed & Used" or "Renewed": the groups in a summary, for its link. */
export function kindsLabel(s: OfferSummary): string {
  const names = s.kinds.map((k) => KIND_NAMES[k.kind]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0];
}

/** "(3 used & new offers)", "(1 new offer)" or "(2 used offers)": what "More Buying Choices" counts (renewed is used). */
export function buyingChoicesText(s: OfferSummary): string {
  const kinds = new Set(s.kinds.map((k) => (k.kind === 'new' ? 'new' : 'used')));
  const what = kinds.size > 1 ? 'used & new' : kinds.has('new') ? 'new' : 'used';
  return `(${s.count} ${what} offer${s.count === 1 ? '' : 's'})`;
}

/**
 * Whether a product can be bought in a condition, as search's "Condition" filter has it: new when
 * it's in stock itself or another seller offers it new, renewed or used when another seller does.
 */
export function buyableAs(p: Pick<Product, 'stock'>, offers: OfferSummary | null | undefined, kind: OfferKind): boolean {
  if (kind === 'new' && p.stock > 0) return true;
  return !!offers?.kinds.some((k) => k.kind === kind);
}
