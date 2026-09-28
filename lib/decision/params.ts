/**
 * Decision state ↔ URL search params, so ranked results are shareable and
 * survive reloads:
 *   w=battery.5,comfort.4   custom weights (omitted when equal to the preset/defaults)
 *   budget=1000000          ceiling in minor units
 *   use=travel              use case from the query (a preset id)
 *   preset=value            preset picked in "Refine what matters" (wins over `use`)
 *   sort=match|price-asc|price-desc|rating   (legacy featured → match, review → rating)
 * Pure — safe on server and client.
 */
import type { Market } from '../types';
import { clampBudget, decisionConfig, findPreset, weightsFor } from './attributes';
import type { RankSort } from './rank';
import type { Weights } from './types';

export interface DecisionParams {
  /** explicit weights from `w`, or null to use the preset / defaults */
  weights: Weights | null;
  budgetMinor: number | null;
  use: string | null;
  preset: string | null;
  sort: RankSort;
}

type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

function getOne(sp: SearchParamsLike, key: string): string | null {
  if (sp instanceof URLSearchParams) return sp.get(key);
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

/** Weights → "battery.5,comfort.4" in the category's attribute order (unknown keys dropped). */
export function encodeWeights(weights: Weights, category?: string | null): string {
  const keys = category ? decisionConfig(category).attributes.map((a) => a.key) : Object.keys(weights);
  return keys
    .filter((k) => k in weights)
    .map((k) => `${k}.${Math.min(5, Math.max(0, Math.round(weights[k])))}`)
    .join(',');
}

/**
 * "battery.5,comfort.4" → weights for the category: listed keys clamped to 0..5,
 * unlisted keys from `fallback` (default: the category defaults). null when nothing valid.
 */
export function decodeWeights(raw: string | null | undefined, category: string | null | undefined, fallback?: Weights): Weights | null {
  if (!raw) return null;
  const cfg = decisionConfig(category);
  const keys = new Set(cfg.attributes.map((a) => a.key));
  const out: Weights = { ...(fallback ?? cfg.defaultWeights) };
  let any = false;
  for (const part of raw.split(',')) {
    const [k, v] = part.split('.');
    const n = Number(v);
    if (!keys.has(k) || v === undefined || !Number.isFinite(n)) continue;
    out[k] = Math.min(5, Math.max(0, Math.round(n)));
    any = true;
  }
  return any ? out : null;
}

const SORTS: Record<string, RankSort> = {
  match: 'match',
  featured: 'match',
  'price-asc': 'price-asc',
  'price-desc': 'price-desc',
  rating: 'rating',
  review: 'rating',
};

/** Read decision params for a category (and store, for budget clamping). */
export function readDecisionParams(sp: SearchParamsLike, category: string | null | undefined, market?: Market): DecisionParams {
  const presetRaw = getOne(sp, 'preset');
  const useRaw = getOne(sp, 'use');
  const preset = findPreset(category, presetRaw) ? presetRaw : null;
  const use = useRaw && /^[a-z0-9-]{1,32}$/.test(useRaw) ? useRaw : null;
  const base = weightsFor(category, preset ?? use);
  const budgetNum = Number(getOne(sp, 'budget'));
  const budgetMinor =
    Number.isFinite(budgetNum) && budgetNum > 0
      ? market
        ? clampBudget(market, category, budgetNum)
        : Math.round(budgetNum)
      : null;
  return {
    weights: decodeWeights(getOne(sp, 'w'), category, base),
    budgetMinor,
    use,
    preset,
    sort: SORTS[getOne(sp, 'sort') ?? ''] ?? 'match',
  };
}

/** The weights to rank with: explicit `w`, else preset, else use, else category defaults. */
export function effectiveWeights(p: Pick<DecisionParams, 'weights' | 'preset' | 'use'>, category: string | null | undefined): Weights {
  return p.weights ? { ...p.weights } : weightsFor(category, p.preset ?? p.use);
}

function sameWeights(a: Weights, b: Weights): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  return true;
}

/**
 * Write decision params onto a copy of `base` (other params like k/dept kept).
 * `w` is omitted when it equals the preset/use/default weights; `sort=match` is omitted.
 */
export function writeDecisionParams(
  p: Partial<DecisionParams>,
  category: string | null | undefined,
  base?: SearchParamsLike,
): URLSearchParams {
  const out = new URLSearchParams();
  if (base instanceof URLSearchParams) base.forEach((v, k) => out.append(k, v));
  else if (base) {
    for (const [k, v] of Object.entries(base)) {
      if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
      else if (v !== undefined) out.set(k, v);
    }
  }
  const set = (k: string, v: string | null | undefined) => (v ? out.set(k, v) : out.delete(k));
  if ('preset' in p) set('preset', p.preset ?? null);
  if ('use' in p) set('use', p.use ?? null);
  if ('budgetMinor' in p) set('budget', p.budgetMinor ? String(Math.round(p.budgetMinor)) : null);
  if ('sort' in p) set('sort', p.sort && p.sort !== 'match' ? p.sort : null);
  if ('weights' in p) {
    const presetId = out.get('preset') ?? out.get('use');
    const implied = weightsFor(category, presetId);
    set('w', p.weights && !sameWeights(p.weights, implied) ? encodeWeights(p.weights, category) : null);
  }
  out.delete('page');
  return out;
}
