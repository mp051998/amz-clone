'use server';
import { db } from '@/lib/supabase/server';
import { getMarketplace } from '@/lib/marketplace-server';
import { askProduct } from '@/lib/data/product-ask';
import { DataError } from '@/lib/data/errors';
import type { AskResult } from '@/lib/product-ask';
import type { ActionResult } from './review';

/** "Looking for specific info?": answer a question about a product from its details, Q&A and reviews. */
export async function askAboutProduct(productId: string, question: string): Promise<ActionResult<{ result: AskResult }>> {
  try {
    const store = await getMarketplace();
    return { ok: true, result: await askProduct(await db(), store.id, productId, question) };
  } catch (err) {
    if (err instanceof DataError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}
