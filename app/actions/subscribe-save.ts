'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { DataError } from '@/lib/data/errors';
import { cancelSubscription, skipSubscription, subscribe, updateSubscription } from '@/lib/data/subscriptions';
import { storePath } from '@/lib/marketplace';
import { getMarket } from '@/lib/session';
import { db } from '@/lib/supabase/server';

const PAGE = '/subscribe-save';

async function signedIn(next: string) {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(next)}`));
  return { market, sp };
}

const int = (v: FormDataEntryValue | null): number => Number.parseInt(String(v ?? ''), 10);

/**
 * "Set up now" on the set-up page: subscribe to `product` (`qty` every `every` months, to `address`,
 * paid with `method`) and place the first delivery, then on to that order. A refusal goes back to
 * the set-up page with the choices and `error`.
 */
export async function subscribeAction(formData: FormData): Promise<void> {
  const product = String(formData.get('product') ?? '');
  const qty = int(formData.get('qty'));
  const every = int(formData.get('every'));
  const back = `${PAGE}/new?product=${encodeURIComponent(product)}&qty=${qty || 1}&every=${every || 1}`;
  const { market, sp } = await signedIn(back);
  let orderId: string;
  try {
    const r = await subscribe(await db(), {
      market,
      productId: product,
      qty,
      everyMonths: every,
      addressId: String(formData.get('address') ?? ''),
      paymentMethod: String(formData.get('method') ?? ''),
    });
    orderId = r.order.id;
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    redirect(sp(`${back}&error=${err.code}`));
  }
  // the header's order count, the product page's box and the manage page
  revalidatePath('/', 'layout');
  redirect(sp(`/orders/${encodeURIComponent(orderId)}?placed=1`));
}

/**
 * Change a subscription (`id`) from the manage page: any of `qty`, `every`, `address`, `method`.
 * Back to the manage page, with `updated` or `error`.
 */
export async function updateSubscriptionAction(formData: FormData): Promise<void> {
  const { sp } = await signedIn(PAGE);
  const id = String(formData.get('id') ?? '');
  const qty = int(formData.get('qty'));
  const every = int(formData.get('every'));
  const address = String(formData.get('address') ?? '');
  const method = String(formData.get('method') ?? '');
  await act(sp, id, 'updated', () =>
    db().then((c) =>
      updateSubscription(c, id, {
        ...(qty ? { qty } : {}),
        ...(every ? { everyMonths: every } : {}),
        ...(address ? { addressId: address } : {}),
        ...(method ? { paymentMethod: method } : {}),
      }),
    ),
  );
}

/** "Skip": the subscription's next delivery doesn't go. */
export async function skipSubscriptionAction(formData: FormData): Promise<void> {
  const { sp } = await signedIn(PAGE);
  const id = String(formData.get('id') ?? '');
  await act(sp, id, 'skipped', () => db().then((c) => skipSubscription(c, id)));
}

/** "Cancel subscription". */
export async function cancelSubscriptionAction(formData: FormData): Promise<void> {
  const { sp } = await signedIn(PAGE);
  const id = String(formData.get('id') ?? '');
  await act(sp, id, 'cancelled', () => db().then((c) => cancelSubscription(c, id)));
}

async function act(sp: (path: string) => string, id: string, done: string, run: () => Promise<unknown>): Promise<never> {
  let code: string | null = null;
  try {
    await run();
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(sp(code ? `${PAGE}?error=${code}#sub-${id}` : `${PAGE}?${done}=1#sub-${id}`));
}
