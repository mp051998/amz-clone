import type { Product } from './types';

/** How many products each of "Your Recommendations" rows starts from, per kind (viewed, bought). */
export const REC_ANCHORS = 3;
/** Products in each row. */
export const REC_ITEMS = 8;

/** Why a row is recommended: a product viewed recently, or one bought. */
export type RecReason = 'viewed' | 'bought';

/** A row of "Your Recommendations": "Because you viewed …" or "Because you bought …". */
export interface RecGroup {
  reason: RecReason;
  /** the product it starts from */
  anchor: Product;
  items: Product[];
}

/**
 * The products each row starts from: the first of `products` (newest first) the viewer hasn't
 * asked to leave out ("Don't use for recommendations"), in this store and still on sale, up to `n`.
 */
export function recAnchors(products: readonly Product[], skip: ReadonlySet<string>, market: string, n = REC_ANCHORS): Product[] {
  return products.filter((p) => !skip.has(p.id) && p.market === market && !p.archived).slice(0, n);
}

/**
 * Tidies the rows: each product in stock once across them (the first row that has it keeps it),
 * none the viewer started from or already bought (`exclude`), up to `n` a row, and rows left
 * empty dropped.
 */
export function tidyRecs(groups: readonly RecGroup[], exclude: ReadonlySet<string>, n = REC_ITEMS): RecGroup[] {
  const shown = new Set([...exclude, ...groups.map((g) => g.anchor.id)]);
  const out: RecGroup[] = [];
  for (const g of groups) {
    const items: Product[] = [];
    for (const p of g.items) {
      if (items.length >= n || shown.has(p.id) || p.stock <= 0) continue;
      shown.add(p.id);
      items.push(p);
    }
    if (items.length) out.push({ ...g, items });
  }
  return out;
}
