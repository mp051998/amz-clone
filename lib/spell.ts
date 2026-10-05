/**
 * Search spelling correction ("Showing results for headphones · Search instead for hedphones").
 *
 * Search matches each query word as a prefix of a word in a product's title, brand or department
 * (search_catalog / to_prefix_tsquery), so one typo finds nothing. The store's own words make the
 * dictionary: a query word that starts no catalog word is swapped for the closest catalog word
 * within a small edit distance, more common words winning ties. Pure; lib/data/spell.ts feeds it.
 */

/** word → how many times it appears across the store's catalog */
export type Vocab = Map<string, number>;

const WORD = /[\p{L}\p{N}]+/gu;
/** words this short are too ambiguous to correct */
const MIN_LEN = 4;

export function tokens(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

export function buildVocab(texts: Iterable<string | null | undefined>): Vocab {
  const v: Vocab = new Map();
  for (const t of texts) {
    if (!t) continue;
    for (const w of tokens(t)) if (w.length >= 2) v.set(w, (v.get(w) ?? 0) + 1);
  }
  return v;
}

/** Edit distance counting a swap of two neighbouring letters as one edit (optimal string alignment). */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** true when search would match the word as it is (it starts some catalog word) */
export function isKnown(word: string, vocab: Vocab): boolean {
  if (vocab.has(word)) return true;
  for (const w of vocab.keys()) if (w.startsWith(word)) return true;
  return false;
}

function allowedEdits(word: string): number {
  return word.length >= 7 ? 2 : 1;
}

/**
 * The catalog word closest to a word search can't match, or null when it's fine as it is, has a
 * digit (model numbers), is too short to guess at, or nothing is close enough. A word may also be
 * a misspelt start of a catalog word ("hedpho" → "headphones").
 */
export function correctWord(word: string, vocab: Vocab): string | null {
  const w = word.toLowerCase();
  if (w.length < MIN_LEN || /\d/.test(w) || isKnown(w, vocab)) return null;
  const max = allowedEdits(w);
  let best: { word: string; d: number; n: number } | null = null;
  for (const [cand, n] of vocab) {
    if (cand.length < MIN_LEN - 1 || /\d/.test(cand)) continue;
    let d = editDistance(w, cand, max);
    // the word may be the (misspelt) start of a longer catalog word
    if (d > max && cand.length > w.length) {
      for (const len of [w.length - 1, w.length, w.length + 1]) {
        if (len >= MIN_LEN - 1 && len < cand.length) d = Math.min(d, editDistance(w, cand.slice(0, len), max));
      }
    }
    if (d > max) continue;
    if (!best || d < best.d || (d === best.d && (n > best.n || (n === best.n && cand.length < best.word.length)))) best = { word: cand, d, n };
  }
  return best?.word ?? null;
}

export interface Correction {
  /** the whole query with the misspelt words replaced */
  query: string;
  /** the keyword part (what search matches), corrected */
  keywords: string;
}

/**
 * Correct the misspelt words of a search. `keywords` are the words search matches (the parser has
 * dropped filler, budgets and the like); only those are corrected, and the same words are swapped in
 * the query as typed so the rest of it ("under $50", "for running") stays. Null when nothing changes.
 */
export function correctQuery(query: string, keywords: string, vocab: Vocab): Correction | null {
  const fixes = new Map<string, string>();
  for (const t of tokens(keywords)) {
    if (fixes.has(t)) continue;
    const fix = correctWord(t, vocab);
    if (fix && fix !== t) fixes.set(t, fix);
  }
  if (!fixes.size) return null;
  const swap = (text: string) => text.replace(WORD, (m) => fixes.get(m.toLowerCase()) ?? m);
  return { query: swap(query), keywords: swap(keywords) };
}
