import type { ReviewFacets, ReviewFilter as ServerFilter, ReviewStars } from '@/lib/data/reviews';
import type { Review } from '@/lib/types';

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

const STOP = new Set(['quality', 'life', 'for', 'money', 'the', 'and', 'with', 'overall', 'build']);
const EXTRA: Record<string, string[]> = {
  value: ['price', 'worth', 'cheap', 'expensive', 'value'],
  noise: ['noise', 'anc', 'cancel'],
  battery: ['battery', 'charge', 'charging'],
  comfort: ['comfort', 'fit', 'wear'],
  sound: ['sound', 'bass', 'audio'],
};

/** Words that identify a theme in review text ("Battery life" → battery|charge|charging). */
export function themeWords(theme: string): string[] {
  const words = theme.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  const base = words.length ? words : theme.toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (const w of base) {
    const key = Object.keys(EXTRA).find((k) => w.startsWith(k));
    (key ? EXTRA[key] : [w]).forEach((x) => out.add(x));
  }
  return [...out];
}

export function mentions(r: Review, words: string[]): boolean {
  if (!words.length) return false;
  const text = `${r.title} ${r.body}`.toLowerCase();
  return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text));
}

/** How many reviews a database filter would list, from the product's facets. */
export function facetCount(facets: ReviewFacets, f: ServerFilter): number {
  const [lo, hi] = f.stars === 'positive' ? [4, 5] : f.stars === 'critical' ? [1, 3] : f.stars ? [f.stars, f.stars] : [1, 5];
  let n = 0;
  for (let star = lo; star <= hi; star++) n += facets[star as 1 | 2 | 3 | 4 | 5][f.verified ? 'verified' : 'all'];
  return n;
}

/** A star filter's chip label: "Positive", "Critical" or "5 star". */
export function starsLabel(stars: ReviewStars): string {
  return stars === 'positive' ? 'Positive' : stars === 'critical' ? 'Critical' : `${stars} star`;
}

/** The labels of the database filters that are on, in chip order. */
export function serverLabels(f: ServerFilter): string[] {
  return [...(f.stars ? [starsLabel(f.stars)] : []), ...(f.verified ? ['Verified purchase'] : [])];
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
