'use server';
import { revalidatePath } from 'next/cache';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { clipCoupon, unclipCoupon } from '@/lib/data/coupons';
import { DataError } from '@/lib/data/errors';

export type CouponResult = { clipped: boolean } | { error: string; message?: string };

/** Apply (or stop applying) a product's coupon. Prices in the cart and checkout change with it. */
export async function setCouponClipped(productId: string, clipped: boolean): Promise<CouponResult> {
  if (!(await readUser())) return { error: 'not_authenticated' };
  try {
    const client = await db();
    if (clipped) await clipCoupon(client, String(productId));
    else await unclipCoupon(client, String(productId));
  } catch (err) {
    if (err instanceof DataError) return { error: err.code, message: err.message };
    throw err;
  }
  revalidatePath('/', 'layout');
  return { clipped };
}
