'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { cleanCity, DELIVER_MAX_AGE, deliverCookie, normalizePostcode, POSTCODE_ERROR, serializeDeliverTo } from '@/lib/deliver-to';
import { getMarket } from '@/lib/session';

export interface DeliverToState {
  error?: string;
  /** bumps on every save, so the dialog can close */
  saved?: number;
}

/**
 * "Choose your location": a typed postcode, or a saved address (its postcode and city). Kept
 * per store in a cookie; the header and product pages pick it up on the refresh.
 */
export async function setDeliverTo(_prev: DeliverToState, formData: FormData): Promise<DeliverToState> {
  const market = await getMarket();
  const postcode = normalizePostcode(market, String(formData.get('postcode') ?? ''));
  if (!postcode) return { error: POSTCODE_ERROR[market] };
  const city = cleanCity(formData.get('city') as string | null);
  (await cookies()).set(deliverCookie(market), serializeDeliverTo({ postcode, city }), {
    path: '/',
    maxAge: DELIVER_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
  });
  revalidatePath('/', 'layout');
  return { saved: Date.now() };
}
