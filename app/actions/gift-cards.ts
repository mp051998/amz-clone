'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { claimDemoGiftCard, redeemGiftCard } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';

const PAGE = '/gift-cards';

export interface RedeemState {
  error?: string;
  done?: string;
}

async function signedIn() {
  const store = await getMarketplace();
  if (!(await readUser())) redirect(storePath(store, `/signin?next=${PAGE}`));
  return store;
}

/** Redeem a gift card code into this store's balance. */
export async function redeemGiftCardAction(_prev: RedeemState, formData: FormData): Promise<RedeemState> {
  const store = await signedIn();
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  try {
    const { amountMinor, balanceMinor } = await redeemGiftCard(await db(), store.id, formData.get('code'));
    revalidatePath('/', 'layout');
    return { done: `${money(amountMinor)} added. Your balance is now ${money(balanceMinor)}.` };
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    if (err.status >= 500) {
      console.error('[gift-cards]', err.code, err.detail ?? '');
      return { error: 'Something went wrong. Please try again.' };
    }
    return { error: err.message };
  }
}

/** Issue the shopper's demo gift card for this store (once) and show its code. */
export async function claimDemoGiftCardAction(): Promise<void> {
  const store = await signedIn();
  await claimDemoGiftCard(await db(), store.id);
  revalidatePath(PAGE);
  redirect(storePath(store, `${PAGE}?claimed=1#balance`));
}
