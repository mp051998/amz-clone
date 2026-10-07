'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { joinPlus, leavePlus, setDeliveryDay } from '@/lib/data/plus';
import { DataError } from '@/lib/data/errors';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';

const PAGE = '/prime';

async function signedIn() {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (!(await readUser())) redirect(sp(`/signin?new=1&next=${PAGE}`));
  return sp;
}

/** Join Plus (free in this demo) and come back to the membership page. */
export async function joinPlusAction(): Promise<void> {
  const sp = await signedIn();
  await joinPlus(await db());
  // prices in the header cart, cart and checkout change with membership
  revalidatePath('/', 'layout');
  redirect(sp(`${PAGE}?joined=1`));
}

/** Set the member's Delivery Day (`day`, 1–7), or turn it off (the `off` button). */
export async function setDeliveryDayAction(formData: FormData): Promise<void> {
  const sp = await signedIn();
  const raw = String(formData.get('day') ?? '');
  const day = formData.get('off') || !/^[1-7]$/.test(raw) ? null : Number(raw);
  try {
    await setDeliveryDay(await db(), day);
  } catch (err) {
    // not a member (any more): the page offers joining instead
    if (err instanceof DataError && err.code === 'plus_required') redirect(sp(PAGE));
    throw err;
  }
  // checkout offers the day
  revalidatePath('/', 'layout');
  redirect(sp(`${PAGE}?day=${day ?? 'off'}#delivery-day`));
}

/** End the membership. Orders already placed keep the delivery they were charged. */
export async function leavePlusAction(): Promise<void> {
  const sp = await signedIn();
  await leavePlus(await db());
  revalidatePath('/', 'layout');
  redirect(sp(`${PAGE}?left=1`));
}
