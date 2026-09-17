'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { readAddresses, writeAddresses, newAddressId, type Address } from '@/lib/addresses';

function str(fd: FormData, key: string, max: number): string {
  return String(fd.get(key) ?? '').trim().slice(0, max);
}

/** Build an Address from the shared checkout/address form fields. */
function addressFromForm(fd: FormData, id: string): Address {
  const kind = str(fd, 'addressType', 10);
  return {
    id,
    name: str(fd, 'fullName', 40),
    phone: str(fd, 'phone', 15),
    line1: str(fd, 'line1', 80),
    line2: str(fd, 'line2', 80) || undefined,
    landmark: str(fd, 'landmark', 60) || undefined,
    city: str(fd, 'city', 40),
    state: str(fd, 'state', 40),
    zip: str(fd, 'postcode', 12),
    kind: kind === 'office' ? 'office' : kind === 'home' ? 'home' : undefined,
  };
}

/** ensure exactly one address carries the default flag. */
function withOneDefault(list: Address[]): Address[] {
  if (list.length && !list.some((a) => a.isDefault)) return list.map((a, i) => ({ ...a, isDefault: i === 0 }));
  return list;
}

/** Add a new address or update an existing one (by hidden `id`), then return to the book. */
export async function saveAddress(formData: FormData): Promise<void> {
  const store = await getMarketplace();
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/account/addresses'));

  const list = await readAddresses();
  const editId = String(formData.get('id') ?? '').trim();
  const isEditing = Boolean(editId) && list.some((a) => a.id === editId);
  // first-ever address is default automatically; otherwise honour the checkbox.
  const makeDefault = String(formData.get('makeDefault') ?? '') === 'on' || list.length === 0;

  const record = addressFromForm(formData, isEditing ? editId : newAddressId());

  let next = isEditing
    ? list.map((a) => (a.id === editId ? { ...record, isDefault: a.isDefault } : a))
    : [...list, record];
  if (makeDefault) next = next.map((a) => ({ ...a, isDefault: a.id === record.id }));

  await writeAddresses(withOneDefault(next));
  revalidatePath('/account/addresses');
  redirect(storePath(store, '/account/addresses'));
}

export async function deleteAddress(formData: FormData): Promise<void> {
  const store = await getMarketplace();
  const id = String(formData.get('id') ?? '').trim();
  const next = withOneDefault((await readAddresses()).filter((a) => a.id !== id));
  await writeAddresses(next);
  revalidatePath('/account/addresses');
  redirect(storePath(store, '/account/addresses'));
}

export async function setDefaultAddress(formData: FormData): Promise<void> {
  const store = await getMarketplace();
  const id = String(formData.get('id') ?? '').trim();
  const next = (await readAddresses()).map((a) => ({ ...a, isDefault: a.id === id }));
  await writeAddresses(next);
  revalidatePath('/account/addresses');
  redirect(storePath(store, '/account/addresses'));
}
