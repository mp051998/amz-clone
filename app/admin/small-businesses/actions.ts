'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Db } from '@/lib/db/client';
import { DataError } from '@/lib/data/errors';
import { addSmallBusiness, removeSmallBusiness, updateSmallBusiness } from '@/lib/data/small-businesses';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import type { Market } from '@/lib/types';
import { adminClient } from '../guard';

/** Run one change and come back to the page with a notice, or the error (and what was typed, to fix it). */
async function change(brand: string, done: string, run: (client: Db, market: Market) => Promise<void>, kept: Record<string, string> = {}) {
  const store = await getMarketplace();
  const page = (qs: Record<string, string>) => storePath(store, `/admin/small-businesses?${new URLSearchParams({ ...qs, brand })}`);
  const { client, error } = await adminClient();
  if (error) redirect(page({ error: 'forbidden' }));
  try {
    await run(client, store.id);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    redirect(page({ error: err.code, ...(err.code === 'invalid_input' ? { msg: err.message, ...kept } : {}) }));
  }
  // the badge shows across the storefront
  revalidatePath('/', 'layout');
  redirect(page({ done }));
}

export async function addSmallBusinessAction(formData: FormData): Promise<void> {
  const brand = String(formData.get('brand') ?? '').trim();
  const story = String(formData.get('story') ?? '');
  await change(brand, 'added', (client, market) => addSmallBusiness(client, market, { brand, story }).then(() => undefined), { story });
}

export async function updateSmallBusinessAction(brand: string, formData: FormData): Promise<void> {
  await change(brand, 'updated', (client, market) => updateSmallBusiness(client, market, brand, formData.get('story')).then(() => undefined));
}

export async function removeSmallBusinessAction(brand: string): Promise<void> {
  await change(brand, 'removed', (client, market) => removeSmallBusiness(client, market, brand));
}
