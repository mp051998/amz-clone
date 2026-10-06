import type { Product } from './types';

/** Options people pick by look (image swatches); the rest (sizes, configurations) are text. */
export const VISUAL_AXES = /^(colou?r|pattern|style|design|finish)$/i;

/** A variant group as a listing card shows it: its option name and every active option. */
export interface VariantSummary {
  axis: string;
  options: { id: string; label: string; image: string; stock: number }[];
}

/** "2 colors", "3 sizes", "4 capacities", "1 pack size". */
export function optionCount(axis: string, n: number): string {
  const word = axis.toLowerCase();
  if (n === 1 || word.endsWith('s')) return `${n} ${word}`;
  return `${n} ${/[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`}`;
}

const key = (p: Product) => (p.variant ? `g:${p.market}:${p.variant.group}` : `p:${p.id}`);

/**
 * One entry per variant group, in the given order: each group keeps its first (best-placed)
 * option and its other options drop out. Products outside a group pass through.
 */
export function foldVariants(items: readonly Product[]): Product[];
export function foldVariants<T>(items: readonly T[], product: (item: T) => Product): T[];
export function foldVariants<T>(items: readonly T[], product: (item: T) => Product = (item) => item as unknown as Product): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(product(item));
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
