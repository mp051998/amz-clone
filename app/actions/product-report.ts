'use server';
import { readUser } from '@/lib/auth';
import { DataError } from '@/lib/data/errors';
import * as reports from '@/lib/data/product-reports';
import { db } from '@/lib/supabase/server';
import type { ActionResult } from './review';

/** "Report an issue with this product" from the product page (signed in). */
export async function reportProductIssue(
  productId: string,
  input: { reason: unknown; details?: unknown },
): Promise<ActionResult<{ report: reports.ProductReport; updated: boolean }>> {
  try {
    if (!(await readUser())) throw new DataError('not_authenticated');
    return { ok: true, ...(await reports.reportProduct(await db(), productId, input)) };
  } catch (err) {
    if (err instanceof DataError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}
