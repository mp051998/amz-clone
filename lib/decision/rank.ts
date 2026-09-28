/**
 * Ranking against a shopper's weights: match %, "why it's here" strengths and
 * one trade-off per product (prototype match()/why()/strength()), generalised to
 * per-category attributes. Pure — safe on server and client.
 */
import type { Product } from '../types';
import { decisionConfig, type AttributeSpec, type CategorySpec } from './attributes';
import { deriveScores, matchScores, pricePercentiles } from './derive';
import type { ProductInsight, RankedProduct, Weights } from './types';

export { matchScores };

export type RankSort = 'match' | 'price-asc' | 'price-desc' | 'rating';

export interface RankOptions {
  /** Drop products priced above this (minor units). null/undefined = no ceiling. */
  budgetMinor?: number | null;
  sort?: RankSort;
  /** Config to rank with; defaults to each product's own category config. */
  config?: CategorySpec;
}

/** Scores for a product: its stored insight, else a rules estimate. */
export function scoresFor(
  product: Product,
  insight: ProductInsight | null | undefined,
  pricePercentile = 0.5,
  config: CategorySpec = decisionConfig(product.category),
): Record<string, number> {
  if (insight && Object.keys(insight.scores).length) return insight.scores;
  return deriveScores(product, config, { pricePercentile });
}

/** 0..100 match of a product against weights (prototype `match`). */
export function match(product: Product, insight: ProductInsight | null | undefined, weights: Weights, pricePercentile = 0.5): number {
  return matchScores(scoresFor(product, insight, pricePercentile), weights);
}

/** Concrete strength line for an attribute ("120h battery", else "Great sound"). */
export function strength(product: Product, attr: AttributeSpec, score: number): string {
  if (attr.detail) {
    const m = product.title.match(new RegExp(attr.detail.pattern, 'i'));
    if (m) return m[0].replace(new RegExp(attr.detail.pattern, 'i'), attr.detail.template);
  }
  return score >= 5 ? attr.strong : attr.good;
}

/** Up to 3 strengths (score ≥ 4), strongest weighted first (prototype `why`). */
export function why(
  product: Product,
  scores: Record<string, number>,
  weights: Weights,
  config: CategorySpec = decisionConfig(product.category),
): string[] {
  return config.attributes
    .filter((a) => (scores[a.key] ?? 0) >= 4)
    .map((a, i) => ({ a, i, rank: (weights[a.key] ?? 0) * (scores[a.key] ?? 0) }))
    .sort((x, y) => y.rank - x.rank || x.i - y.i)
    .slice(0, 3)
    .map(({ a }) => strength(product, a, scores[a.key]));
}

/**
 * One trade-off: the weakest attribute the shopper cares about (weight ≥ 3,
 * score ≤ 2), else the insight's first con, else low stock. null when clean.
 */
export function warn(
  product: Product,
  scores: Record<string, number>,
  weights: Weights,
  insight?: ProductInsight | null,
  config: CategorySpec = decisionConfig(product.category),
): string | null {
  const weak = config.attributes
    .filter((a) => (weights[a.key] ?? 0) >= 3 && (scores[a.key] ?? 3) <= 2)
    .sort((x, y) => (scores[x.key] ?? 3) - (scores[y.key] ?? 3) || (weights[y.key] ?? 0) - (weights[x.key] ?? 0))[0];
  if (weak) return weak.weak;
  if (insight?.cons.length) return insight.cons[0];
  if (product.stock > 0 && product.stock <= 5) return `Only ${product.stock} left in stock`;
  return null;
}

/** Rank one product. */
export function rankOne(
  product: Product,
  insight: ProductInsight | null,
  weights: Weights,
  pricePercentile = 0.5,
  config: CategorySpec = decisionConfig(product.category),
): RankedProduct {
  const scores = scoresFor(product, insight, pricePercentile, config);
  return {
    product,
    insight,
    match: matchScores(scores, weights),
    why: why(product, scores, weights, config),
    warn: warn(product, scores, weights, insight, config),
  };
}

/**
 * Rank products against weights: filters to the budget, scores each (insight
 * or rules estimate), and sorts. Ties on match break by rating, then price.
 */
export function rankProducts(
  products: Product[],
  insights: Map<string, ProductInsight> | Record<string, ProductInsight>,
  weights: Weights,
  opts: RankOptions = {},
): RankedProduct[] {
  const get = (id: string): ProductInsight | null =>
    (insights instanceof Map ? insights.get(id) : insights[id]) ?? null;
  const pct = pricePercentiles(products);
  const inBudget = opts.budgetMinor != null ? products.filter((p) => p.priceMinor <= opts.budgetMinor!) : products;
  const ranked = inBudget.map((p) => rankOne(p, get(p.id), weights, pct.get(p.id) ?? 0.5, opts.config ?? decisionConfig(p.category)));
  const sort = opts.sort ?? 'match';
  const cmp: Record<RankSort, (a: RankedProduct, b: RankedProduct) => number> = {
    match: (a, b) => b.match - a.match || b.product.rating - a.product.rating || a.product.priceMinor - b.product.priceMinor,
    'price-asc': (a, b) => a.product.priceMinor - b.product.priceMinor || b.match - a.match,
    'price-desc': (a, b) => b.product.priceMinor - a.product.priceMinor || b.match - a.match,
    rating: (a, b) => b.product.rating - a.product.rating || b.product.reviewCount - a.product.reviewCount,
  };
  return ranked.sort(cmp[sort]);
}
