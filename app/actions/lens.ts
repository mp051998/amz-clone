'use server';
import { searchByImage, type LensInput } from '@/lib/data/lens';
import { DataError } from '@/lib/data/errors';
import type { LensResult } from '@/lib/lens';
import type { ActionResult } from './review';

/** Search by image: what to search for to find the thing in a photo (the search box shrinks it first). */
export async function lookAtImage(input: LensInput): Promise<ActionResult<{ result: LensResult }>> {
  try {
    return { ok: true, result: await searchByImage(input ?? {}) };
  } catch (err) {
    if (err instanceof DataError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}
