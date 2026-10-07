import type { Product, ReviewFit } from './types';

/** "How does it fit?" answers, in the order they're offered. */
export const REVIEW_FITS: readonly ReviewFit[] = ['small', 'true_to_size', 'large'];

export const FIT_LABELS: Record<ReviewFit, string> = { small: 'Runs small', true_to_size: 'True to size', large: 'Runs large' };

/** Fewest answers before a product shows how it fits. */
export const FIT_MIN = 3;

/** Categories whose reviews ask how it fits (clothing and shoes). */
const FIT_CATEGORIES = new Set(['fashion']);

export function asksFit(p: Pick<Product, 'category'>): boolean {
  return FIT_CATEGORIES.has(p.category);
}

export function isReviewFit(v: unknown): v is ReviewFit {
  return (REVIEW_FITS as readonly unknown[]).includes(v);
}

/** How many visible reviews gave each answer. */
export type FitCounts = Record<ReviewFit, number>;

export interface FitSummary {
  counts: FitCounts;
  total: number;
  /** the most given answer (true to size on a tie with it, else runs small/large in that order) */
  verdict: ReviewFit;
  /** share of answers per option, 0–100, rounded */
  pct: FitCounts;
}

/** The fit shown on a product, or null with fewer than FIT_MIN answers. */
export function fitSummary(counts: FitCounts): FitSummary | null {
  const total = counts.small + counts.true_to_size + counts.large;
  if (total < FIT_MIN) return null;
  const order: ReviewFit[] = ['true_to_size', 'small', 'large'];
  const verdict = order.reduce((best, f) => (counts[f] > counts[best] ? f : best), order[0]);
  const pct = (n: number) => Math.round((n / total) * 100);
  return { counts, total, verdict, pct: { small: pct(counts.small), true_to_size: pct(counts.true_to_size), large: pct(counts.large) } };
}
