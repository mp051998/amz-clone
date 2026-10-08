/**
 * Review themes ("Battery life", "Value for money") matched against written reviews. Shared by the
 * "Mentions battery" filter chips and the praised/criticized counts, so a theme is only said to be
 * mentioned when a review's own words say so. Pure — safe on the client.
 */

export interface ThemeCount {
  theme: string;
  count: number;
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

/** Whether a review's title and body use any of a theme's words (at the start of a word). */
export function textMentions(r: { title?: string | null; body?: string | null }, words: string[]): boolean {
  if (!words.length) return false;
  const text = `${r.title ?? ''} ${r.body ?? ''}`.toLowerCase();
  return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text));
}

/**
 * Praised and criticized themes counted from written reviews: a praised theme counts the 4–5 star
 * reviews that mention it, a criticized one the 1–3 star reviews. Themes no review mentions are
 * left out; the rest are most-mentioned first (ties keep their order).
 */
export function countThemes(
  themes: { praised: ThemeCount[]; criticized: ThemeCount[] },
  reviews: { rating: number; title?: string | null; body?: string | null }[],
): { praised: ThemeCount[]; criticized: ThemeCount[] } {
  const count = (list: ThemeCount[], keep: (rating: number) => boolean) =>
    list
      .map(({ theme }) => {
        const words = themeWords(theme);
        return { theme, count: reviews.filter((r) => keep(r.rating) && textMentions(r, words)).length };
      })
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);
  return { praised: count(themes.praised, (n) => n >= 4), criticized: count(themes.criticized, (n) => n <= 3) };
}
