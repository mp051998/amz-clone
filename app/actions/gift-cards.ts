'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { claimDemoGiftCard, redeemGiftCard } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { startBalanceReload, startGiftCardPurchase } from '@/lib/data/gift-card-purchases';
import { startGiftCardCheckout } from '@/lib/data/payments';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { siteOrigin } from '@/lib/origin';

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

export interface BuyState {
  error?: string;
  /** which field the error is about: amount, recipient or message */
  field?: string;
}

/**
 * Buy a gift card: record the purchase, then hand off to Stripe hosted Checkout for exactly its
 * amount. The code is issued once Stripe reports the session paid (/gift-cards/success, webhook).
 */
export async function buyGiftCardAction(_prev: BuyState, formData: FormData): Promise<BuyState> {
  const store = await signedIn();
  const sp = (path: string) => storePath(store, path);
  let url: string;
  try {
    const client = await db();
    const purchase = await startGiftCardPurchase(client, store.id, {
      amountMinor: Number(formData.get('amountMinor')),
      recipientName: formData.get('recipientName'),
      message: formData.get('message'),
    });
    const origin = await siteOrigin();
    url = await startGiftCardCheckout(
      purchase,
      { successUrl: `${origin}${sp(`${PAGE}/success`)}`, cancelUrl: `${origin}${sp(`${PAGE}?canceled=1#buy`)}` },
      'Store gift card',
      await readUser(),
    );
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    if (err.status >= 500 && err.code !== 'payments_unavailable') {
      console.error('[gift-cards] buy', err.code, err.detail ?? '');
      return { error: 'Something went wrong. Please try again.' };
    }
    return { error: err.message, field: err.code === 'invalid_input' ? err.detail : undefined };
  }
  redirect(url);
}

/**
 * Reload the balance ("Reload Your Balance", amazon.in's "Add Money"): record the reload, then hand
 * off to Stripe hosted Checkout for exactly its amount. The balance is credited once Stripe reports
 * the session paid (/gift-cards/success, webhook).
 */
export async function reloadBalanceAction(_prev: BuyState, formData: FormData): Promise<BuyState> {
  const store = await signedIn();
  const sp = (path: string) => storePath(store, path);
  let url: string;
  try {
    const reload = await startBalanceReload(await db(), store.id, Number(formData.get('amountMinor')));
    const origin = await siteOrigin();
    url = await startGiftCardCheckout(
      reload,
      { successUrl: `${origin}${sp(`${PAGE}/success?for=reload`)}`, cancelUrl: `${origin}${sp(`${PAGE}?canceled=1&for=reload#balance`)}` },
      store.id === 'IN' ? 'Add money to balance' : 'Balance reload',
      await readUser(),
    );
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    if (err.status >= 500 && err.code !== 'payments_unavailable') {
      console.error('[gift-cards] reload', err.code, err.detail ?? '');
      return { error: 'Something went wrong. Please try again.' };
    }
    return { error: err.message, field: err.code === 'invalid_input' ? err.detail : undefined };
  }
  redirect(url);
}
