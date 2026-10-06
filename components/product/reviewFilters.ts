import type { Review } from '@/lib/types';

/**
 * Client-side review filters for "Explore reviews" (prototype RF): fixed chips plus theme chips
 * derived from the insight's praised/criticized themes. Pure — unit-testable.
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

export const BASE_FILTERS: ReviewFilter[] = [
  { id: 'positive', label: 'Positive', test: (r) => r.rating >= 4 },
  { id: 'critical', label: 'Critical', test: (r) => r.rating <= 3 },
  { id: 'verified', label: 'Verified purchase', test: (r) => r.verified },
];

/** "5 star": picked from the rating histogram, shown as a chip only while it is on. */
export function starFilter(star: number): ReviewFilter {
  return { id: `star:${star}`, label: `${star} star`, test: (r) => r.rating === star };
}

/** The star picked in the histogram, if any (`star:4` → 4). */
export function activeStar(active: string[]): number | null {
  const id = active.find((a) => /^star:[1-5]$/.test(a));
  return id ? Number(id.slice(5)) : null;
}

/** Fixed filters + one chip per theme that at least one loaded review mentions (+ the picked star first). */
export function buildFilters(reviews: Review[], themes: string[], star: number | null = null): ReviewFilter[] {
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
  return [...(star ? [starFilter(star)] : []), ...BASE_FILTERS, ...themed.slice(0, 4)];
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
