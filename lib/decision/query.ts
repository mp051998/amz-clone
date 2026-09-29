/**
 * Rules query parser (prototype `parse()`, generalised): pulls a budget
 * ("under ₹10k", "$50", "below 10,000", "under 1 lakh"), a use case (→ preset)
 * and a category out of free text, leaving keywords for full-text search.
 * Pure — the AI parser (lib/ai/features/parseQuery.ts) falls back to this.
 */
import { formatMoney } from '../marketplaces';
import type { Category, Market } from '../types';
import { decisionConfig, CONFIGURED_CATEGORIES, GENERIC_CONFIG, type CategorySpec } from './attributes';
import type { ParsedQuery, QueryIntent } from './types';

const CURRENCY = '(?:rs\\.?|inr|₹|\\$|usd|dollars?|rupees?)';
/** a number, optional k/lakh multiplier, and not a spec unit ("40 hours", "8 GB") */
const UNIT_GUARD = '(?!\\s*(?:h\\b|hrs?\\b|hours?|mah|gb|tb|mp\\b|inch|in\\b|"|kg|lbs?|years?|yrs?|pcs|pieces?|w\\b|mm|ml|litres?|liters?|%|x\\b))';
const AMOUNT = `(\\d+(?:\\.\\d+)?)\\s*(k|thousand|lakhs?)?\\b${UNIT_GUARD}`;
const CEILING = '(?:under|below|less than|within|up ?to|upto|max(?:imum)?|budget(?: of)?|<|at most|not more than)';

export interface BudgetHit {
  /** ceiling in minor units (cents / paise) */
  minor: number;
  /** span of the budget phrase in `normalizeNumbers(text)` */
  start: number;
  end: number;
}

/** "10,000" → "10000" (commas between digits only). */
export function normalizeNumbers(text: string): string {
  return text.replace(/(\d),(?=\d)/g, '$1');
}

function toMinor(n: string, unit: string | undefined): number {
  let v = Number(n);
  const u = (unit ?? '').toLowerCase();
  if (u === 'k' || u === 'thousand') v *= 1000;
  else if (u.startsWith('lakh')) v *= 100_000;
  return Math.round(v * 100);
}

/**
 * Budget ceiling in a query: "under ₹10k", "below rs 5,000", "budget 2000",
 * "< $50", "$50", "5000 rupees", "10k", "2 lakh", or a bare "10,000".
 * Positions refer to the comma-stripped text.
 */
export function parseBudget(text: string): BudgetHit | null {
  const t = normalizeNumbers(text).toLowerCase();
  const patterns = [
    new RegExp(`${CEILING}\\s*${CURRENCY}?\\s*${AMOUNT}(?:\\s*${CURRENCY})?`, 'i'),
    new RegExp(`${CURRENCY}\\s*${AMOUNT}`, 'i'),
    new RegExp(`\\b${AMOUNT}\\s*${CURRENCY}`, 'i'),
    /\b(\d+(?:\.\d+)?)\s*(k|lakhs?)\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m && m.index !== undefined) {
      const minor = toMinor(m[1], m[2]);
      if (minor > 0) return { minor, start: m.index, end: m.index + m[0].length };
    }
  }
  // a bare thousands-separated number in the original text ("10,000")
  const sep = text.match(/\b\d{1,3}(?:,\d{2,3})+\b/);
  if (sep) {
    const digits = sep[0].replace(/,/g, '');
    const at = t.indexOf(digits);
    if (at >= 0) return { minor: Number(digits) * 100, start: at, end: at + digits.length };
  }
  return null;
}

const STOP = new Set([
  'a', 'an', 'the', 'for', 'with', 'and', 'or', 'to', 'of', 'in', 'on', 'my', 'me', 'i', 'need', 'want', 'looking',
  'best', 'good', 'great', 'top', 'some', 'something', 'that', 'is', 'are', 'which', 'under', 'below', 'around', 'about',
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text: string, phrase: string): { index: number; length: number } | null {
  const m = text.match(new RegExp(`(?:^|[^a-z0-9])(${escapeRe(phrase)})(?=$|[^a-z0-9])`, 'i'));
  if (!m || m.index === undefined) return null;
  return { index: m.index + m[0].length - m[1].length, length: m[1].length };
}

/** Category slug the text names, among the store's categories (longest synonym wins). */
export function detectCategory(text: string, categories: Category[]): string | null {
  const t = text.toLowerCase();
  let best: { slug: string; len: number } | null = null;
  for (const c of categories) {
    const cfg = CONFIGURED_CATEGORIES.includes(c.slug) ? decisionConfig(c.slug) : null;
    const words = [c.slug, c.name.toLowerCase(), ...(cfg?.synonyms ?? [])];
    for (const w of words) {
      if (w.length > (best?.len ?? 0) && containsPhrase(t, w)) best = { slug: c.slug, len: w.length };
    }
  }
  return best?.slug ?? null;
}

/** Preset id implied by use-case words ("travel", "gym"), within a category config. */
export function detectUse(text: string, cfg: CategorySpec): { id: string; phrase: string } | null {
  const t = text.toLowerCase();
  let best: { id: string; phrase: string; len: number } | null = null;
  for (const p of cfg.presets) {
    for (const k of p.keywords) {
      const hit = containsPhrase(t, k);
      if (hit && k.length > (best?.len ?? 0)) best = { id: p.id, phrase: k, len: k.length };
    }
  }
  return best ? { id: best.id, phrase: best.phrase } : null;
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Parse a free-text query for a store. `categories` are the store's departments
 * (lib/data/catalog listCategories) — detection only picks among them.
 */
export function parseQuery(market: Market, q: string, categories: Category[]): ParsedQuery {
  const raw = (q ?? '').trim().slice(0, 200);
  let rest = normalizeNumbers(raw);

  // budget
  const budget = parseBudget(rest);
  if (budget) rest = `${rest.slice(0, budget.start)} ${rest.slice(budget.end)}`;

  // category
  const category = detectCategory(raw, categories);
  const cfg = category ? decisionConfig(category) : GENERIC_CONFIG;

  // use case: in the detected category; with no category, the first category
  // config that recognises it (the preset id is applied once a category is known)
  let use = detectUse(rest, cfg);
  if (!use && !category) {
    for (const slug of CONFIGURED_CATEGORIES) {
      use = detectUse(rest, decisionConfig(slug));
      if (use) break;
    }
  }
  if (use) rest = rest.replace(new RegExp(`\\b(?:for\\s+)?${escapeRe(use.phrase)}\\w*\\b`, 'i'), ' ');

  // keywords: drop filler and bare department names ("electronics"); keep product nouns
  const catName = categories.find((c) => c.slug === category)?.name.toLowerCase();
  const keywords = rest
    .replace(/[^\p{L}\p{N}\s'&-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()) && w.toLowerCase() !== category && w.toLowerCase() !== catName)
    .join(' ')
    .trim();

  return buildParsedQuery(market, { keywords, category, budgetMinor: budget?.minor ?? null, use: use?.id ?? null }, categories, 'rules', raw);
}

/** Preset label for a preset id: in the category's config, else any config that has it. */
function presetLabelFor(category: string | null, presetId: string): string | null {
  const own = decisionConfig(category).presets.find((p) => p.id === presetId);
  if (own) return own.label;
  for (const slug of CONFIGURED_CATEGORIES) {
    const p = decisionConfig(slug).presets.find((x) => x.id === presetId);
    if (p) return p.label;
  }
  return null;
}

/**
 * Assemble a ParsedQuery (intent chips + headline) from its parts. Shared by the
 * rules parser and the AI parser so both produce identical chips. `title` is
 * generated unless given.
 */
export function buildParsedQuery(
  market: Market,
  parts: { keywords: string; category: string | null; budgetMinor: number | null; use: string | null; title?: string },
  categories: Category[],
  source: ParsedQuery['source'],
  rawQuery = '',
): ParsedQuery {
  const { keywords, category, budgetMinor } = parts;
  const cfg = category ? decisionConfig(category) : GENERIC_CONFIG;
  const presetLabel = parts.use ? presetLabelFor(category, parts.use) : null;
  const use = presetLabel ? parts.use : null;
  const budgetText = budgetMinor ? formatMoney(budgetMinor, market === 'IN' ? 'INR' : 'USD') : null;
  const intents: QueryIntent[] = [];

  if (category) {
    const name = categories.find((c) => c.slug === category)?.name ?? category;
    intents.push({ kind: 'category', label: name, param: 'dept', value: category, removable: true });
  }
  if (budgetMinor) intents.push({ kind: 'budget', label: `Under ${budgetText}`, param: 'budget', value: String(budgetMinor), removable: true });
  if (use && presetLabel) intents.push({ kind: 'use', label: `For ${presetLabel.toLowerCase()}`, param: 'use', value: use, removable: true });
  if (keywords) intents.push({ kind: 'keyword', label: `“${keywords}”`, param: 'k', value: keywords, removable: false });

  const subject = keywords ? cap(keywords) : category ? cfg.headline : rawQuery ? cap(rawQuery) : 'Results';
  const title =
    parts.title?.trim() ||
    subject + (presetLabel ? ` for ${presetLabel.toLowerCase()}` : '') + (budgetText ? ` under ${budgetText}` : '');

  return { keywords, category, budgetMinor: budgetMinor ?? null, use, intents, title, source };
}
