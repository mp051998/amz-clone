/**
 * Deterministic "rules" insight builder: attribute scores, pros/cons, best-for,
 * a review summary and praised/criticized themes, derived only from a product's
 * title, bullets, rating, review volume and price rank within its category.
 *
 * Used by scripts/build-insights.mjs (seed) and at runtime as the fallback for
 * products without a `product_insights` row. Only `import type` statements are
 * allowed (the seed script imports this file with Node's type stripping), so the
 * category config is passed in rather than imported.
 */
import type { CategorySpec } from './attributes';
import type { ProductInsight, Weights } from './types';

export interface InsightInput {
  id: string;
  title: string;
  bullets?: string[] | null;
  brand?: string | null;
  rating: number;
  reviewCount: number;
  priceMinor: number;
}

export interface InsightContext {
  /** 0 = cheapest in its category+store, 1 = most expensive. */
  pricePercentile: number;
}

/** Weighted match 0..100: Σ w·s / Σ w·5. Missing scores count as 3. */
export function matchScores(scores: Record<string, number>, weights: Weights): number {
  let num = 0;
  let den = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (!(weight > 0)) continue;
    const s = scores[key];
    num += weight * (Number.isFinite(s) ? s : 3);
    den += weight * 5;
  }
  return den ? Math.round((num / den) * 100) : 0;
}

/** Deterministic PRNG (mulberry32) seeded from a string — same generator the seed builders use. */
function seeded(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Share of ratings that are positive (4–5★) / negative (1–2★ + half of 3★), from the average. */
function sentimentSplit(rating: number): { pos: number; neg: number } {
  const tiers: [number, number[]][] = [
    [4.7, [78, 14, 4, 2, 2]],
    [4.5, [70, 18, 6, 3, 3]],
    [4.3, [62, 22, 9, 4, 3]],
    [4.1, [55, 24, 12, 5, 4]],
    [3.9, [47, 26, 15, 7, 5]],
    [3.5, [39, 26, 18, 10, 7]],
  ];
  const pct = tiers.find(([min]) => rating >= min)?.[1] ?? [30, 25, 21, 13, 11];
  return { pos: (pct[0] + pct[1]) / 100, neg: (pct[3] + pct[4] + pct[2] / 2) / 100 };
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(Math.round(n / 100) / 10).toLocaleString('en-US')}k` : String(n);
}

/** Attribute scores 1..5 for a product. */
export function deriveScores(input: InsightInput, cfg: CategorySpec, ctx: InsightContext): Record<string, number> {
  const text = `${input.title} ${(input.bullets ?? []).join(' ')} ${input.brand ?? ''}`;
  const rating = Number(input.rating) || 4;
  const volume = Math.log10((input.reviewCount || 0) + 1); // 0 … ~5
  const pct = clamp(Number.isFinite(ctx.pricePercentile) ? ctx.pricePercentile : 0.5, 0, 1);
  const scores: Record<string, number> = {};

  for (const attr of cfg.attributes) {
    const rng = seeded(`${input.id}#${attr.key}`);
    const jitter = (rng() - 0.5) * 0.9;
    let signal = 0;
    for (const [pattern, delta] of attr.signals) {
      if (new RegExp(pattern, 'i').test(text)) signal += delta;
    }
    let raw: number;
    if (attr.key === 'value') {
      raw = 4.7 - 3 * pct + (rating - 4.2) * 1.2 + signal * 0.5 + jitter * 0.5;
    } else if (attr.key === 'reviews' || attr.key === 'acclaim') {
      raw = 2.6 + (rating - 4.2) * 2 + (volume - 2.5) * 0.5 + signal * 0.5 + jitter * 0.5;
    } else {
      // pricier products tend to be better built; rating carries the rest
      raw = 2.7 + (rating - 4.2) * 1.6 + (pct - 0.5) * 0.8 + signal + jitter;
    }
    scores[attr.key] = clamp(Math.round(raw), 1, 5);
  }
  return scores;
}

/** Full rules insight (without `updatedAt`, which the caller stamps). */
export function deriveInsight(
  input: InsightInput,
  cfg: CategorySpec,
  ctx: InsightContext,
): Omit<ProductInsight, 'updatedAt'> {
  const scores = deriveScores(input, cfg, ctx);
  const byScore = cfg.attributes
    .map((a, i) => ({ a, s: scores[a.key], i }))
    .sort((x, y) => y.s - x.s || x.i - y.i);

  const strong = byScore.filter((x) => x.s >= 4 && (x.a.key !== 'value' || x.s === 5));
  const pros = (strong.length ? strong : byScore.slice(0, 1)).slice(0, 3).map((x) => x.a.label);

  const weakest = byScore.slice().reverse();
  const cons: string[] = [];
  for (const x of weakest) {
    if (cons.length >= 2) break;
    if (x.s <= 2 || (cons.length === 0 && x.s <= 3)) cons.push(x.a.weak);
  }
  if (cons.length < 2 && input.reviewCount < 150) cons.push('Few reviews so far');

  // best-for: the preset this product matches best ("value" only when it is genuinely cheap)
  let bestFor = cfg.presets[0]?.bestFor ?? '';
  let bestMatch = -1;
  for (const p of cfg.presets) {
    if (p.id === 'value' && scores.value < 5) continue;
    const m = matchScores(scores, p.weights);
    if (m > bestMatch) {
      bestMatch = m;
      bestFor = p.bestFor;
    }
  }

  const total = Math.max(0, Math.round(input.reviewCount || 0));
  const { pos, neg } = sentimentSplit(Number(input.rating) || 4);
  const praisedShares = [0.34, 0.22, 0.14];
  const praised = byScore.slice(0, 3).map((x, i) => ({
    theme: x.a.label,
    count: total ? Math.max(1, Math.round(total * pos * praisedShares[i])) : 0,
  }));
  const criticizedShares = [0.45, 0.25];
  const criticized = weakest.slice(0, 2).map((x, i) => ({
    theme: x.a.label,
    count: total ? Math.max(1, Math.round(total * neg * criticizedShares[i])) : 0,
  }));

  const top = byScore.slice(0, 2).map((x) => x.a.phrase);
  const weakLine = weakest[0] && weakest[0].s <= 3 ? weakest[0].a.weak : '';
  const complaint = weakLine ? weakLine.charAt(0).toLowerCase() + weakLine.slice(1) : '';
  const summary = total
    ? `Owners rate it ${Number(input.rating).toFixed(1)} out of 5 across ${formatCount(total)} ratings. ` +
      `Most praise its ${top.join(' and ')}` +
      (complaint ? `; the most common complaint is ${complaint.replace(/\.$/, '')}.` : '.')
    : `New arrival — strongest on ${top.join(' and ')} going by its specs.`;

  return { productId: input.id, scores, pros, cons, bestFor, summary, praised, criticized, source: 'rules' };
}

/**
 * Price percentile of each product within its (market, category) group:
 * id → 0 (cheapest) … 1 (priciest). Groups of one get 0.5.
 */
export function pricePercentiles(
  products: { id: string; market?: string; category: string; priceMinor: number }[],
): Map<string, number> {
  const groups = new Map<string, { id: string; priceMinor: number }[]>();
  for (const p of products) {
    const key = `${p.market ?? ''}|${p.category}`;
    const g = groups.get(key) ?? [];
    g.push(p);
    groups.set(key, g);
  }
  const out = new Map<string, number>();
  for (const g of groups.values()) {
    const sorted = g.slice().sort((a, b) => a.priceMinor - b.priceMinor || a.id.localeCompare(b.id));
    sorted.forEach((p, i) => out.set(p.id, sorted.length > 1 ? i / (sorted.length - 1) : 0.5));
  }
  return out;
}
