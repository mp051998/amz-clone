'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import * as addresses from '@/lib/data/addresses';
import { DataError } from '@/lib/data/errors';

const BOOK = '/account/addresses';

function fields(fd: FormData): addresses.AddressFieldsInput {
  return {
    fullName: fd.get('fullName'),
    phone: fd.get('phone'),
    line1: fd.get('line1'),
    line2: fd.get('line2'),
    landmark: fd.get('landmark'),
    city: fd.get('city'),
    state: fd.get('state'),
    postcode: fd.get('postcode'),
    addressType: fd.get('addressType'),
    instructions: fd.get('instructions'),
  };
}

async function signedIn() {
  const market = await getMarket();
  if (!(await readUser())) redirect(storePath({ id: market }, `/signin?next=${BOOK}`));
  return { client: await db(), market };
}

/** Add a new address or update an existing one (by hidden `id`), then return to the book. */
export async function saveAddress(formData: FormData): Promise<void> {
  const { client, market } = await signedIn();
  const editId = String(formData.get('id') ?? '').trim();
  const makeDefault = String(formData.get('makeDefault') ?? '') === 'on';
  try {
    if (editId) await addresses.updateAddress(client, market, editId, fields(formData), makeDefault);
    else await addresses.createAddress(client, market, fields(formData), makeDefault);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    const qs = new URLSearchParams({ error: err.code, msg: err.message });
    if (editId) qs.set('edit', editId);
    else qs.set('new', '1');
    redirect(storePath({ id: market }, `${BOOK}?${qs}`));
  }
  revalidatePath(BOOK);
  redirect(storePath({ id: market }, BOOK));
}

export async function deleteAddress(formData: FormData): Promise<void> {
  const { client, market } = await signedIn();
  try {
    await addresses.deleteAddress(client, market, String(formData.get('id') ?? '').trim());
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
  }
  revalidatePath(BOOK);
  redirect(storePath({ id: market }, BOOK));
}

export async function setDefaultAddress(formData: FormData): Promise<void> {
  const { client, market } = await signedIn();
  try {
    await addresses.setDefaultAddress(client, market, String(formData.get('id') ?? '').trim());
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
  }
  revalidatePath(BOOK);
  redirect(storePath({ id: market }, BOOK));
}
