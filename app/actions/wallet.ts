'use server';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { siteOrigin } from '@/lib/origin';
import { DataError } from '@/lib/data/errors';
import { removeSavedCard, startAddCard } from '@/lib/data/wallet';

const PAGE = '/account/payments';

async function signedIn() {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  const user = await readUser();
  if (!user) redirect(sp(`/signin?next=${PAGE}`));
  return { user, sp };
}

/** "Add a card": off to Stripe's page to type it; it comes back to Your Payments saved. */
export async function addCardAction(): Promise<void> {
  const { user, sp } = await signedIn();
  const origin = await siteOrigin();
  let url: string | null = null;
  let code = 'internal';
  try {
    url = await startAddCard(user, { successUrl: `${origin}${sp(PAGE)}`, cancelUrl: `${origin}${sp(`${PAGE}?canceled=1`)}` });
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  redirect(url ?? sp(`${PAGE}?error=${encodeURIComponent(code)}`));
}

/** Remove a saved card. */
export async function removeCardAction(formData: FormData): Promise<void> {
  const { user, sp } = await signedIn();
  let code: string | null = null;
  try {
    await removeSavedCard(user.id, formData.get('id'));
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  redirect(sp(code ? `${PAGE}?error=${encodeURIComponent(code)}` : `${PAGE}?removed=1`));
}
