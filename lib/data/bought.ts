import type { Db } from '../db/client';
import { boughtLabel } from '../bought';

/**
 * "1K+ bought in past month" for each of `ids` that sold past Amazon's floor in the last 30 days,
 * by product id (counted in the database from placed orders; smaller counts never leave it).
 */
export async function boughtPastMonth(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const res = await db.rpc('bought_past_month', { p_ids: [...new Set(ids)] });
  if (res.error) return out; // only a label (or the count isn't deployed yet)
  for (const [id, units] of Object.entries((res.data ?? {}) as Record<string, number>)) {
    const label = boughtLabel(Number(units));
    if (label) out.set(id, label);
  }
  return out;
}
