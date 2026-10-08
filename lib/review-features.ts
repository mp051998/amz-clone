import type { Product } from './types';

/**
 * "By feature", as on Amazon's reviews: reviewers can rate a few things about the product
 * ("Easy to use", "Value for money") on 1–5 stars, and the product shows each one's average once
 * enough have. Which features are asked depends on the category; books ask none.
 */
export const FEATURE_LABELS = {
  value_for_money: 'Value for money',
  easy_to_use: 'Easy to use',
  easy_to_clean: 'Easy to clean',
  build_quality: 'Build quality',
  sturdiness: 'Sturdiness',
  durability: 'Durability',
  performance: 'Performance',
  comfort: 'Comfort',
  material_quality: 'Material quality',
  scent: 'Scent',
  fun: 'Fun',
  grip: 'Grip',
  battery_life: 'Battery life',
  camera_quality: 'Camera quality',
  screen_quality: 'Screen quality',
} as const;

export type ReviewFeature = keyof typeof FEATURE_LABELS;

/** A review's feature ratings: feature → 1–5 stars. */
export type FeatureStars = Partial<Record<ReviewFeature, number>>;

const CATEGORY_FEATURES: Record<string, readonly ReviewFeature[]> = {
  electronics: ['easy_to_use', 'build_quality', 'value_for_money'],
  computers: ['performance', 'build_quality', 'value_for_money'],
  mobiles: ['battery_life', 'camera_quality', 'screen_quality', 'value_for_money'],
  wearables: ['battery_life', 'comfort', 'value_for_money'],
  'home-kitchen': ['easy_to_use', 'easy_to_clean', 'sturdiness', 'value_for_money'],
  'kitchen-appliances': ['easy_to_use', 'easy_to_clean', 'build_quality', 'value_for_money'],
  fashion: ['comfort', 'material_quality', 'value_for_money'],
  beauty: ['scent', 'easy_to_use', 'value_for_money'],
  toys: ['fun', 'durability', 'value_for_money'],
  sports: ['durability', 'comfort', 'value_for_money'],
  yoga: ['grip', 'comfort', 'durability', 'value_for_money'],
};

/** Fewest ratings before a feature shows on the product. */
export const FEATURE_MIN = 3;

/** The features a review of this product asks about, in the order they're asked (none for books). */
export function featuresFor(p: Pick<Product, 'category'>): readonly ReviewFeature[] {
  return CATEGORY_FEATURES[p.category] ?? [];
}

export function isReviewFeature(v: unknown): v is ReviewFeature {
  return typeof v === 'string' && Object.hasOwn(FEATURE_LABELS, v);
}

/** A stored review's feature ratings, keeping only known features rated 1–5. */
export function readFeatureStars(v: unknown): FeatureStars {
  const out: FeatureStars = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, n] of Object.entries(v)) if (isReviewFeature(k) && Number.isInteger(n) && n >= 1 && n <= 5) out[k] = n as number;
  return out;
}

/** One feature's average on a product. */
export interface FeatureRating {
  feature: ReviewFeature;
  label: string;
  /** to one decimal */
  average: number;
  count: number;
}

/**
 * The features a product shows: those with at least FEATURE_MIN ratings, rounded to one decimal.
 * With `only`, just those features in that order (the product's category); otherwise every
 * feature rated, most rated first.
 */
export function featureRatings(rows: readonly { feature: string; average: number; count: number }[], only?: readonly ReviewFeature[]): FeatureRating[] {
  const shown = rows
    .filter((r): r is { feature: ReviewFeature; average: number; count: number } => isReviewFeature(r.feature) && r.count >= FEATURE_MIN)
    .map((r) => ({ feature: r.feature, label: FEATURE_LABELS[r.feature], average: Math.round(r.average * 10) / 10, count: r.count }));
  if (only) return only.flatMap((f) => shown.filter((r) => r.feature === f));
  return shown.sort((a, b) => b.count - a.count || (a.feature < b.feature ? -1 : 1));
}
