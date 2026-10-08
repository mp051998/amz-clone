import type { ReviewFacets, ReviewFilter as ServerFilter, ReviewStars } from '@/lib/data/reviews';
import type { Review } from '@/lib/types';
import { textMentions, themeWords } from '@/lib/review-themes';

/** Reviews loaded at a time: the first page, and again after a filter changes. */
export const REVIEW_PAGE = 30;

/**
 * "Explore reviews" filters (prototype RF). Stars and verified purchase are asked of the
 * database, so they cover every review; the theme chips ("Mentions battery") come from the
 * insight's praised/criticized themes and match the loaded reviews' text here. Pure — unit-testable.
 */
export interface ReviewFilter {
  id: string;
  label: string;
  test: (r: Review) => boolean;
}

export { themeWords };

export function mentions(r: Review, words: string[]): boolean {
  return textMentions(r, words);
}

/** How many reviews a database filter would list, from the product's facets. */
export function facetCount(facets: ReviewFacets, f: ServerFilter): number {
  const [lo, hi] = f.stars === 'positive' ? [4, 5] : f.stars === 'critical' ? [1, 3] : f.stars ? [f.stars, f.stars] : [1, 5];
  let n = 0;
  const key = f.photos ? (f.verified ? 'verifiedPhotos' : 'photos') : f.verified ? 'verified' : 'all';
  for (let star = lo; star <= hi; star++) n += facets[star as 1 | 2 | 3 | 4 | 5][key] ?? 0;
  return n;
}

/** A star filter's chip label: "Positive", "Critical" or "5 star". */
export function starsLabel(stars: ReviewStars): string {
  return stars === 'positive' ? 'Positive' : stars === 'critical' ? 'Critical' : `${stars} star`;
}

/** The labels of the database filters that are on, in chip order. */
export function serverLabels(f: ServerFilter): string[] {
  return [
    ...(f.q ? [`“${f.q}”`] : []),
    ...(f.stars ? [starsLabel(f.stars)] : []),
    ...(f.verified ? ['Verified purchase'] : []),
    ...(f.photos ? ['With photos'] : []),
  ];
}

/** Picking a star chip again turns it off; another star replaces it. */
export function toggleStars(f: ServerFilter, stars: ReviewStars): ServerFilter {
  const { stars: current, ...rest } = f;
  return current === stars ? rest : { ...rest, stars };
}

/** Up to four theme chips, one per theme that at least one loaded review mentions. */
export function buildFilters(reviews: Review[], themes: string[]): ReviewFilter[] {
  const seen = new Set<string>();
  const themed: ReviewFilter[] = [];
  for (const t of themes) {
    const key = t.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const words = themeWords(t);
    const f: ReviewFilter = { id: `theme:${key}`, label: `Mentions ${key}`, test: (r) => mentions(r, words) };
    if (reviews.some(f.test)) themed.push(f);
  }
  return themed.slice(0, 4);
}

/** Reviews passing every active filter. */
export function applyFilters(reviews: Review[], filters: ReviewFilter[], active: string[]): Review[] {
  const on = filters.filter((f) => active.includes(f.id));
  return reviews.filter((r) => on.every((f) => f.test(r)));
}

/** Count for a chip = reviews matching it together with the other active filters (prototype rChips). */
export function chipCount(reviews: Review[], filters: ReviewFilter[], active: string[], id: string): number {
  const f = filters.find((x) => x.id === id);
  if (!f) return 0;
  return applyFilters(reviews, filters, active.filter((a) => a !== id)).filter(f.test).length;
}

/** Themes a review mentions (for its tag row). */
export function reviewThemes(r: Review, themes: string[], max = 2): string[] {
  return themes.filter((t) => mentions(r, themeWords(t))).slice(0, max);
}

/** `text` split into plain and matching parts (case-insensitive), to bold what a search found. */
export function highlightParts(text: string, q: string | undefined): { text: string; hit: boolean }[] {
  if (!q) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, at)) {
    if (i > at) parts.push({ text: text.slice(at, i), hit: false });
    parts.push({ text: text.slice(i, i + needle.length), hit: true });
    at = i + needle.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}
