'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { joinPlus, leavePlus, setDeliveryDay, setPlusPlan, setPlusRenewal } from '@/lib/data/plus';
import { isPlusPlanId } from '@/lib/plus-plans';
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

/** Not a member (any more): the page offers joining instead. */
function membersOnly(sp: (path: string) => string, err: unknown): never {
  if (err instanceof DataError && err.code === 'plus_required') redirect(sp(PAGE));
  throw err;
}

/** Join Plus on the chosen `plan` (monthly when none; free in this demo) and come back to the membership page. */
export async function joinPlusAction(formData?: FormData): Promise<void> {
  const sp = await signedIn();
  const plan = formData?.get('plan');
  await joinPlus(await db(), await getMarket(), isPlusPlanId(plan) ? plan : 'monthly');
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
    membersOnly(sp, err);
  }
  // checkout offers the day
  revalidatePath('/', 'layout');
  redirect(sp(`${PAGE}?day=${day ?? 'off'}#delivery-day`));
}

/** Switch to `plan` from the next renewal on (the current plan cancels a switch). */
export async function setPlusPlanAction(formData: FormData): Promise<void> {
  const sp = await signedIn();
  const plan = formData.get('plan');
  if (!isPlusPlanId(plan)) redirect(sp(`${PAGE}#membership`));
  try {
    await setPlusPlan(await db(), plan);
  } catch (err) {
    membersOnly(sp, err);
  }
  redirect(sp(`${PAGE}?plan=${plan}#membership`));
}

/** Turn renewal on (`renew=1`) or off, keeping the benefits until the period ends. */
export async function setPlusRenewalAction(formData: FormData): Promise<void> {
  const sp = await signedIn();
  const renew = formData.get('renew') === '1';
  try {
    await setPlusRenewal(await db(), renew);
  } catch (err) {
    membersOnly(sp, err);
  }
  redirect(sp(`${PAGE}?renew=${renew ? 'on' : 'off'}#membership`));
}

/** End the membership at once. Orders already placed keep the delivery they were charged. */
export async function leavePlusAction(): Promise<void> {
  const sp = await signedIn();
  await leavePlus(await db());
  revalidatePath('/', 'layout');
  redirect(sp(`${PAGE}?left=1`));
}
