'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getProduct } from '@/lib/catalog';
import { readCart, writeCart } from '@/lib/cart';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

function qtyOf(formData: FormData, fallback = 1): number {
  const n = Number(formData.get('qty'));
  return Number.isFinite(n) && n > 0 ? Math.min(30, Math.floor(n)) : fallback;
}

export async function addToCart(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!getProduct(id)) return;
  const map = await readCart();
  map[id] = Math.min(30, (map[id] ?? 0) + qtyOf(formData));
  await writeCart(map);
  revalidatePath('/', 'layout');
  const store = await getMarketplace();
  redirect(storePath(store, '/cart'));
}

export async function buyNow(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!getProduct(id)) return;
  const map = await readCart();
  map[id] = Math.min(30, (map[id] ?? 0) + qtyOf(formData));
  await writeCart(map);
  revalidatePath('/', 'layout');
  const store = await getMarketplace();
  redirect(storePath(store, '/checkout'));
}

/** set a line's quantity; qty=0 removes it. */
export async function updateQty(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const qty = Number(formData.get('qty'));
  const map = await readCart();
  if (!getProduct(id)) return;
  if (!Number.isFinite(qty) || qty <= 0) delete map[id];
  else map[id] = Math.min(30, Math.floor(qty));
  await writeCart(map);
  revalidatePath('/cart');
  revalidatePath('/', 'layout');
}

export async function removeItem(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const map = await readCart();
  delete map[id];
  await writeCart(map);
  revalidatePath('/cart');
  revalidatePath('/', 'layout');
}

export async function clearCart(): Promise<void> {
  await writeCart({});
  revalidatePath('/cart');
  revalidatePath('/', 'layout');
}
