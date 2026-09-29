/**
 * Rules compare verdict + "What's different" table + "Same on all" line
 * (prototype compare screen). Pure — the AI verdict
 * (lib/ai/features/compare.ts) falls back to this.
 */
import { formatMoney } from '../marketplaces';
import { decisionConfig, type CategorySpec } from './attributes';
import { scoresFor, strength } from './rank';
import type { Product } from '../types';
import type { CompareVerdict, RankedProduct, Weights } from './types';

/** "Sony WH-CH720N Wireless Noise…" → "Sony WH-CH720N Wireless" (first clause, ≤ 4 words). */
export function shortTitle(title: string, words = 4): string {
  const head = title.split(/[,(|–—]/)[0].trim();
  return head.split(/\s+/).slice(0, words).join(' ');
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function winnerIndex(ranked: RankedProduct[]): number {
  let wi = 0;
  ranked.forEach((r, i) => {
    const w = ranked[wi];
    if (r.match > w.match || (r.match === w.match && r.product.rating > w.product.rating)) wi = i;
  });
  return wi;
}

/**
 * Verdict for 2–4 ranked products. The winner is the best match (ties → rating);
 * it "leads on" the attributes the shopper weighs ≥ 3 where it scores highest.
 */
export function compareVerdict(ranked: RankedProduct[], weights: Weights, config?: CategorySpec): CompareVerdict {
  if (!ranked.length) return { winnerId: '', text: '', perProduct: [], source: 'rules' };
  const cfg = config ?? decisionConfig(ranked[0].product.category);
  const scores = ranked.map((r) => scoresFor(r.product, r.insight, 0.5, cfg));
  const wi = winnerIndex(ranked);
  const win = ranked[wi];
  const leads = cfg.attributes
    .filter((a) => (weights[a.key] ?? 0) >= 3 && scores[wi][a.key] === Math.max(...scores.map((s) => s[a.key] ?? 0)))
    .map((a) => a.phrase)
    .slice(0, 3);
  const text =
    `${shortTitle(win.product.title)} is the best match for your priorities (${win.match}%)` +
    (leads.length && ranked.length > 1 ? `, leading on ${joinAnd(leads)}.` : '.');

  const perProduct = ranked.map((r, i) => {
    const s = scores[i];
    const byScore = cfg.attributes
      .map((a, k) => ({ a, k, v: s[a.key] ?? 3 }))
      .sort((x, y) => y.v - x.v || x.k - y.k);
    const strengths = byScore.slice(0, 3).map((x) => strength(r.product, x.a, x.v));
    const tradeoffs = r.insight?.cons.length
      ? r.insight.cons.slice(0, 2)
      : byScore
          .slice()
          .reverse()
          .filter((x) => x.v <= 3)
          .slice(0, 2)
          .map((x) => x.a.weak);
    return { productId: r.product.id, bestFor: r.insight?.bestFor || cfg.presets[0]?.bestFor || '', strengths, tradeoffs };
  });

  return { winnerId: win.product.id, text, perProduct, source: 'rules' };
}

export interface CompareCell {
  text: string;
  /** strictly the best value in this row (only when values differ) */
  best: boolean;
}

export interface CompareRow {
  label: string;
  cells: CompareCell[];
}

export interface CompareTable {
  /** rows where the products differ ("What's different") */
  rows: CompareRow[];
  /** "Label: value" for rows identical across every product ("Same on all") */
  same: string[];
}

const SCORE_WORD: Record<number, string> = { 5: 'Excellent', 4: 'Great', 3: 'Good', 2: 'Fair', 1: 'Weak' };

/** One table row: label, cell text, and an optional score (highest = BEST; null = no BEST marker). */
type RowDef<T> = [label: string, text: (item: T, i: number) => string, score: ((item: T, i: number) => number) | null];

/** Identical rows collapse into "Same on all"; the rest keep column order, with BEST on the top score. */
function buildTable<T>(items: T[], defs: RowDef<T>[]): CompareTable {
  const rows: CompareRow[] = [];
  const same: string[] = [];
  for (const [label, textOf, scoreOf] of defs) {
    const texts = items.map(textOf);
    if (texts.every((t) => t === texts[0])) {
      if (texts[0] !== '—') same.push(`${label}: ${texts[0]}`);
      continue;
    }
    const sc = scoreOf ? items.map(scoreOf) : null;
    const max = sc ? Math.max(...sc) : null;
    const distinct = sc ? new Set(sc).size > 1 : false;
    rows.push({ label, cells: texts.map((text, i) => ({ text, best: !!sc && distinct && sc[i] === max })) });
  }
  return { rows, same };
}

const availability = (p: Product) => (p.stock > 5 ? 'In stock' : p.stock > 0 ? `Only ${p.stock} left` : 'Out of stock');

/** "What's different" + "Same on all" for ranked products (column order preserved). */
export function compareTable(ranked: RankedProduct[], config?: CategorySpec): CompareTable {
  if (!ranked.length) return { rows: [], same: [] };
  const cfg = config ?? decisionConfig(ranked[0].product.category);
  const cur = ranked[0].product.curBase;
  const scores = ranked.map((r) => scoresFor(r.product, r.insight, 0.5, cfg));

  return buildTable<RankedProduct>(ranked, [
    ['Price', (r) => formatMoney(r.product.priceMinor, cur), (r) => -r.product.priceMinor],
    ['Match for you', (r) => `${r.match}%`, (r) => r.match],
    ['Rating', (r) => `${r.product.rating.toFixed(1)} ★`, (r) => r.product.rating],
    ['Ratings', (r) => r.product.reviewCount.toLocaleString('en-US'), (r) => r.product.reviewCount],
    ...cfg.attributes.map(
      (a): RowDef<RankedProduct> => [a.label, (_r, i) => SCORE_WORD[scores[i][a.key] ?? 3] ?? 'Good', (_r, i) => scores[i][a.key] ?? 3],
    ),
    ['Discount', (r) => (r.product.dealPct ? `${r.product.dealPct}% off` : '—'), (r) => r.product.dealPct ?? 0],
    ['Brand', (r) => r.product.brand ?? '—', null],
    ['Sold by', (r) => r.product.seller || '—', null],
    ['Ships from', (r) => r.product.shipsFrom || '—', null],
    ['Availability', (r) => availability(r.product), (r) => r.product.stock],
  ]);
}

/**
 * Table for products from different categories: only the facts every product has (no match, no
 * category scores) and no BEST markers, since there's no shared basis to rank them on.
 */
export function mixedCompareTable(products: Product[]): CompareTable {
  if (!products.length) return { rows: [], same: [] };
  const cur = products[0].curBase;
  return buildTable<Product>(products, [
    ['Category', (p) => p.categoryName || p.category, null],
    ['Price', (p) => formatMoney(p.priceMinor, cur), null],
    ['Rating', (p) => `${p.rating.toFixed(1)} ★`, null],
    ['Ratings', (p) => p.reviewCount.toLocaleString('en-US'), null],
    ['Discount', (p) => (p.dealPct ? `${p.dealPct}% off` : '—'), null],
    ['Brand', (p) => p.brand ?? '—', null],
    ['Sold by', (p) => p.seller || '—', null],
    ['Ships from', (p) => p.shipsFrom || '—', null],
    ['Availability', availability, null],
  ]);
}

export interface CategoryGroup {
  slug: string;
  name: string;
  ids: string[];
}

/** Products grouped by category, in first-seen order. More than one group = a mixed comparison. */
export function categoryGroups(products: Product[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  for (const p of products) {
    const g = groups.get(p.category) ?? { slug: p.category, name: p.categoryName || p.category, ids: [] };
    g.ids.push(p.id);
    groups.set(p.category, g);
  }
  return [...groups.values()];
}
