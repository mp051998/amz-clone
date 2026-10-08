import type { ReviewFeature } from './review-features';

/**
 * "Looking for specific info?" on a product page (Amazon's search box above the reviews, which
 * Rufus later took over): a shopper's question is matched against what the page already says —
 * the seller's details, customer Q&A and reviews — and the best few passages come back with
 * where they're from. An AI answer (lib/ai/features/ask.ts) may sit on top; this is the rules part.
 * Pure — safe on the client (the result highlights the matched words).
 */

export const ASK_MIN = 3;
export const ASK_MAX = 150;
/** passages shown under a question */
export const ASK_SNIPPETS = 4;

export type AskKind = 'details' | 'qa' | 'review';

export interface AskPassage {
  kind: AskKind;
  /** what's shown: a detail, an answer or a sentence of a review */
  text: string;
  /** a Q&A passage: the question it answers */
  question?: string;
  /** a review passage: its stars */
  rating?: number;
  /** passages of one review or one question share it: at most one of them is shown */
  group?: string;
}

export interface AskResult {
  question: string;
  /** an AI answer from the passages (null: none, or no provider) */
  answer: string | null;
  snippets: AskPassage[];
  /** the question's words, stemmed, to highlight in the snippets */
  terms: string[];
  source: 'rules' | 'ai';
}

/** A question as typed, tidied (null when too short or too long). */
export function readAskQuestion(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const q = v.replace(/\s+/g, ' ').trim();
  return q.length >= ASK_MIN && q.length <= ASK_MAX ? q : null;
}

const STOP = new Set(
  (
    'a an the and or but if so of to in on at by for from with without into onto about as is are was were be been being am do does did done ' +
    'can could will would should shall may might must have has had having it its it’s this that these those there here they them their ' +
    'i me my mine you your yours we our us he she his her him what which who whom whose when where why how much many any some ' +
    'not no yes than then too very also just only more most less get gets got item product thing one ones anyone someone long well really'
  ).split(' '),
);

/** A word cut to its stem, so "batteries" finds "battery" and "charging" finds "charge". */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/['’]s$/, '');
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && /(s|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;

function words(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

/** Whether two stems are the same word ("charg" and "charger"): equal, or one starts the other and both are 4+ letters. */
function same(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** The words of a question worth looking for, stemmed, in order, without repeats. */
export function askTerms(question: string): string[] {
  const out: string[] = [];
  for (const w of words(question)) {
    if (STOP.has(w.replace(/['’]s$/, ''))) continue;
    if (w.length < (/\d/.test(w) ? 2 : 3)) continue;
    const s = stem(w);
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, 12);
}

/** Sentences of a block of text (lines are sentences too). */
export function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“(])/u)
    .map((s) => s.trim())
    .filter((s) => words(s).length >= 2);
}

const MAX_TEXT = 280;

function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT - 1).replace(/\s+\S*$/, '')}…` : t;
}

export interface AskSources {
  bullets: readonly string[];
  details: readonly (readonly [string, string])[];
  description?: string | null;
  questions: readonly { id: string; body: string; answers: readonly { body: string }[] }[];
  reviews: readonly { rating: number; title: string; body: string }[];
}

/** Everything a question can be answered from, as passages. Unanswered questions have nothing to offer. */
export function productPassages(src: AskSources): AskPassage[] {
  const out: AskPassage[] = [];
  for (const b of src.bullets) if (b.trim()) out.push({ kind: 'details', text: clip(b) });
  for (const [k, v] of src.details) out.push({ kind: 'details', text: clip(`${k}: ${v}`) });
  for (const s of sentences(src.description ?? '')) out.push({ kind: 'details', text: clip(s) });
  for (const q of src.questions) {
    for (const a of q.answers.slice(0, 3)) out.push({ kind: 'qa', text: clip(a.body), question: q.body, group: `q:${q.id}` });
  }
  src.reviews.forEach((r, i) => {
    const title = r.title.trim();
    for (const s of [...(title ? [title] : []), ...sentences(r.body)]) {
      out.push({ kind: 'review', text: clip(s), rating: r.rating, group: `r:${i}` });
    }
  });
  return out;
}

const KIND_ORDER: Record<AskKind, number> = { details: 0, qa: 1, review: 2 };

/**
 * The passages that best match a question's terms, best first. A term found in few passages
 * counts for more than one found everywhere, and a passage matching more of the question beats
 * one matching less; a passage must match at least a third of the terms. At most one passage per
 * review or question, and `perKind` of each kind.
 */
export function rankPassages(
  terms: readonly string[],
  passages: readonly AskPassage[],
  opts: { limit?: number; perKind?: number } = {},
): AskPassage[] {
  if (!terms.length || !passages.length) return [];
  const limit = opts.limit ?? ASK_SNIPPETS;
  const perKind = opts.perKind ?? 2;
  const hits = passages.map((p) => {
    const ws = new Set([...words(p.text), ...(p.question ? words(p.question) : [])].map(stem));
    return terms.filter((t) => [...ws].some((w) => same(w, t)));
  });
  const df = new Map<string, number>();
  for (const h of hits) for (const t of h) df.set(t, (df.get(t) ?? 0) + 1);
  const n = passages.length;
  const scored = passages
    .map((p, i) => {
      const h = hits[i];
      const weight = h.reduce((sum, t) => sum + Math.log(1 + n / (df.get(t) ?? 1)), 0);
      return { p, i, score: weight * (0.5 + (0.5 * h.length) / terms.length) };
    })
    .filter((s, i) => s.score > 0 && hits[i].length >= Math.ceil(terms.length / 3))
    .sort((a, b) => b.score - a.score || KIND_ORDER[a.p.kind] - KIND_ORDER[b.p.kind] || a.i - b.i);
  const out: AskPassage[] = [];
  const groups = new Set<string>();
  const kinds: Record<AskKind, number> = { details: 0, qa: 0, review: 0 };
  for (const { p } of scored) {
    if (out.length >= limit) break;
    if (kinds[p.kind] >= perKind || (p.group && groups.has(p.group))) continue;
    if (out.some((o) => o.text === p.text)) continue;
    kinds[p.kind]++;
    if (p.group) groups.add(p.group);
    out.push(p);
  }
  return out;
}

/** `text` split into plain words and words matching one of `terms`, to bold the matches. */
export function matchParts(text: string, terms: readonly string[]): { text: string; hit: boolean }[] {
  if (!terms.length) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(WORD)) {
    const hit = terms.some((t) => same(stem(m[0]), t));
    if (!hit) continue;
    const i = m.index ?? 0;
    if (i > at) parts.push({ text: text.slice(at, i), hit: false });
    parts.push({ text: m[0], hit: true });
    at = i + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}

const FEATURE_QUESTION: Record<ReviewFeature, string> = {
  value_for_money: 'Is it good value for money?',
  easy_to_use: 'Is it easy to use?',
  easy_to_clean: 'Is it easy to clean?',
  build_quality: 'How is the build quality?',
  sturdiness: 'Is it sturdy?',
  durability: 'How long does it last?',
  performance: 'How does it perform?',
  comfort: 'Is it comfortable?',
  material_quality: 'How is the material quality?',
  scent: 'How does it smell?',
  fun: 'Is it fun?',
  grip: 'How is the grip?',
  battery_life: 'How long does the battery last?',
  camera_quality: 'How good is the camera?',
  screen_quality: 'How good is the screen?',
};

/** Questions to try, from what the product's reviews rate (and its fit, for things with sizes). */
export function askSuggestions(features: readonly ReviewFeature[], fit = false): string[] {
  return [...(fit ? ['Does it run true to size?'] : []), ...features.map((f) => FEATURE_QUESTION[f])].slice(0, 3);
}
