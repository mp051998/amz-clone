'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createProduct,
  deleteProduct,
  isAdmin,
  toMinor,
  updateProduct,
  uploadProductImage,
  validateProduct,
  type ProductFieldErrors,
} from '@/lib/data/admin-catalog';
import { DataError } from '@/lib/data/errors';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';

/** What the product form needs back: field errors, a form-level message, and the values to keep. */
export interface ProductFormState {
  errors?: ProductFieldErrors & { form?: string };
  values?: Record<string, string>;
}

const FIELDS = ['title', 'brand', 'category', 'image', 'price', 'listPrice', 'badge', 'boughtPastMonth', 'seller', 'shipsFrom', 'bullets', 'stock'] as const;

/** Signed in + admin, checked on every call (a form on an admin page is not a security boundary). */
async function adminClient() {
  const client = await db();
  const { data } = await client.auth.getUser();
  if (!data.user) return { client, error: 'Your session ended. Sign in again to continue.' };
  if (!(await isAdmin(client))) return { client, error: 'Only store admins can change the catalogue.' };
  return { client, error: null };
}

/**
 * Create (`id` null) or update a product from the admin form. Prices arrive in major units
 * ("19.99"); an uploaded image wins over the image URL field.
 */
export async function saveProduct(id: string | null, _prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const values: Record<string, string> = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? '')]));
  values.deal = formData.get('deal') === 'on' ? 'on' : '';
  const back = (errors: ProductFormState['errors']): ProductFormState => ({ errors, values });

  const store = await getMarketplace();
  const { client, error } = await adminClient();
  if (error) return back({ form: error });

  const file = formData.get('imageFile');
  const upload = file instanceof File && file.size > 0 ? file : null;
  const priceMinor = toMinor(values.price);
  const listMinor = values.listPrice.trim() ? toMinor(values.listPrice) : null;
  const stock = /^\d+$/.test(values.stock.trim()) ? Number(values.stock.trim()) : NaN;
  const input = {
    title: values.title,
    brand: values.brand,
    category: values.category,
    // validated before the upload so a bad form never leaves an orphaned image behind
    image: upload ? 'https://upload.pending/image' : values.image,
    priceMinor: priceMinor ?? NaN,
    listMinor,
    deal: values.deal === 'on',
    badge: values.badge,
    boughtPastMonth: values.boughtPastMonth,
    seller: values.seller,
    shipsFrom: values.shipsFrom,
    bullets: values.bullets.split('\n').map((l) => l.trim()).filter(Boolean),
    stock,
  };

  const checked = validateProduct(input);
  const errors: ProductFormState['errors'] = checked.ok ? {} : { ...checked.errors };
  if (priceMinor == null) errors.priceMinor = 'Enter a price like 19.99';
  if (values.listPrice.trim() && listMinor == null) errors.listMinor = 'Enter a price like 24.99, or leave it blank';
  if (Number.isNaN(stock)) errors.stock = 'Enter a whole number';
  if (Object.keys(errors).length) return back(errors);

  let saved: string;
  try {
    if (upload) input.image = await uploadProductImage(client, store.id, upload);
    values.image = input.image;
    if (id) {
      await updateProduct(client, id, input);
      saved = id;
    } else {
      saved = await createProduct(client, store.id, input);
    }
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    const field = err.detail === 'image' ? 'image' : err.code === 'invalid_category' ? 'category' : null;
    return back(field ? { [field]: err.message } : { form: err.message });
  }

  revalidatePath('/', 'layout');
  redirect(storePath(store, `/admin/products?done=${id ? 'updated' : 'created'}&id=${encodeURIComponent(saved)}`));
}

/** Delete a product; ordered products can't be deleted (the edit page explains why). */
export async function removeProduct(id: string): Promise<void> {
  const store = await getMarketplace();
  const { client, error } = await adminClient();
  const edit = (code: string) => storePath(store, `/admin/products/${encodeURIComponent(id)}?error=${code}`);
  if (error) redirect(edit('forbidden'));
  try {
    await deleteProduct(client, id);
  } catch (err) {
    if (err instanceof DataError) redirect(edit(err.code));
    throw err;
  }
  revalidatePath('/', 'layout');
  redirect(storePath(store, '/admin/products?done=deleted'));
}
