'use server';
import { readUser } from '@/lib/auth';
import { DataError } from '@/lib/data/errors';
import { reportLowerPrice } from '@/lib/data/lower-price';
import type { PriceReport } from '@/lib/lower-price';
import { db } from '@/lib/supabase/server';
import type { ActionResult } from './review';

/** "Tell us about a lower price" from the product page (signed in). */
export async function tellLowerPrice(
  productId: string,
  input: { seenAt: unknown; priceMinor: unknown; shippingMinor?: unknown; url?: unknown; store?: unknown; city?: unknown; seenOn?: unknown },
): Promise<ActionResult<{ report: PriceReport; updated: boolean }>> {
  try {
    if (!(await readUser())) throw new DataError('not_authenticated');
    return { ok: true, ...(await reportLowerPrice(await db(), productId, input)) };
  } catch (err) {
    if (err instanceof DataError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}
