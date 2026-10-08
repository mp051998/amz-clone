import type { Db } from '../db/client';
import { recAnchors, tidyRecs, REC_ITEMS, type RecGroup } from '../recommendations';
import type { Market, Product } from '../types';
import { alsoBought } from './also-bought';
import { alsoViewed } from './also-viewed';

/**
 * "Your Recommendations": a row for each of the latest few products viewed (`viewed`, newest
 * first) of what shoppers viewed with it, then for each of the latest few bought (`bought`) of
 * what its buyers bought too, leaving out the products in `skip` ("Don't use for
 * recommendations"). Nothing bought is recommended again, and each product shows once. A row
 * that fails is left out.
 */
export async function recommendations(
  db: Db,
  market: Market,
  { viewed, bought, skip }: { viewed: readonly Product[]; bought: readonly Product[]; skip: ReadonlySet<string> },
): Promise<RecGroup[]> {
  const fromViews = recAnchors(viewed, skip, market);
  const fromBuys = recAnchors(bought.filter((p) => !fromViews.some((v) => v.id === p.id)), skip, market);
  const rows = await Promise.all([
    ...fromViews.map(async (anchor): Promise<RecGroup> => ({ reason: 'viewed', anchor, items: await alsoViewed(db, anchor, REC_ITEMS + 4).catch(() => []) })),
    ...fromBuys.map(async (anchor): Promise<RecGroup> => ({ reason: 'bought', anchor, items: await alsoBought(db, anchor, REC_ITEMS + 4).catch(() => []) })),
  ]);
  return tidyRecs(rows, new Set(bought.map((p) => p.id)));
}
