'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createProduct,
  deleteProduct,
  GALLERY_MAX,
  imageFileError,
  setArchived,
  toMinor,
  updateProduct,
  uploadProductImage,
  validateProduct,
  type ProductFieldErrors,
} from '@/lib/data/admin-catalog';
import { DataError } from '@/lib/data/errors';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { parseDetailLines } from '@/lib/product-details';
import { adminClient } from './guard';

/** What the product form needs back: field errors, a form-level message, and the values to keep. */
export interface ProductFormState {
  errors?: ProductFieldErrors & { form?: string };
  values?: Record<string, string>;
}

const FIELDS = ['title', 'brand', 'category', 'image', 'price', 'listPrice', 'coupon', 'limit', 'sizes', 'badge', 'boughtPastMonth', 'seller', 'shipsFrom', 'bullets', 'description', 'details', 'stock', 'variantGroup', 'variantAxis', 'variantLabel'] as const;
/** Field errors the data layer can raise after validation. */
const LATE_FIELDS = new Set(['image', 'gallery', 'variantGroup', 'variantAxis', 'variantLabel']);

/**
 * Create (`id` null) or update a product from the admin form. Prices arrive in major units
 * ("19.99"); an uploaded image wins over the image URL field. Gallery images arrive as kept URLs
 * (`gallery`, in order) plus new uploads (`galleryFiles`), which go after them.
 */
export async function saveProduct(id: string | null, _prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const values: Record<string, string> = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? '')]));
  values.deal = formData.get('deal') === 'on' ? 'on' : '';
  const kept = formData.getAll('gallery').map((v) => String(v).trim()).filter(Boolean);
  values.gallery = kept.join('\n');
  const back = (errors: ProductFormState['errors']): ProductFormState => ({ errors, values });

  const store = await getMarketplace();
  const { client, error } = await adminClient();
  if (error) return back({ form: error });

  const file = formData.get('imageFile');
  const upload = file instanceof File && file.size > 0 ? file : null;
  const galleryUploads = formData.getAll('galleryFiles').filter((f): f is File => f instanceof File && f.size > 0);
  const priceMinor = toMinor(values.price);
  const listMinor = values.listPrice.trim() ? toMinor(values.listPrice) : null;
  const stock = /^\d+$/.test(values.stock.trim()) ? Number(values.stock.trim()) : NaN;
  const couponText = values.coupon.trim().replace(/%$/, '').trim();
  const couponPct = !couponText ? null : /^\d+$/.test(couponText) ? Number(couponText) : NaN;
  const limitText = values.limit.trim();
  const maxPerCustomer = !limitText ? null : /^\d+$/.test(limitText) ? Number(limitText) : NaN;
  // "S, M, L": blank for a product that doesn't come in sizes
  const sizeList = values.sizes.split(',').map((s) => s.trim()).filter(Boolean);
  const details = parseDetailLines(values.details);
  const input = {
    title: values.title,
    brand: values.brand,
    category: values.category,
    // validated before the upload so a bad form never leaves an orphaned image behind
    image: upload ? 'https://upload.pending/image' : values.image,
    priceMinor: priceMinor ?? NaN,
    listMinor,
    deal: values.deal === 'on',
    couponPct,
    maxPerCustomer,
    sizes: sizeList.length ? sizeList : null,
    badge: values.badge,
    boughtPastMonth: values.boughtPastMonth,
    seller: values.seller,
    shipsFrom: values.shipsFrom,
    bullets: values.bullets.split('\n').map((l) => l.trim()).filter(Boolean),
    description: values.description,
    details: details.rows,
    stock,
    // new uploads hold their place until the form checks out (like the main image)
    gallery: [...kept, ...galleryUploads.map((_, i) => `https://upload.pending/gallery-${i}`)],
    variantGroup: values.variantGroup,
    variantAxis: values.variantAxis,
    variantLabel: values.variantLabel,
  };

  const checked = validateProduct(input);
  const errors: ProductFormState['errors'] = checked.ok ? {} : { ...checked.errors };
  if (priceMinor == null) errors.priceMinor = 'Enter a price like 19.99';
  if (values.listPrice.trim() && listMinor == null) errors.listMinor = 'Enter a price like 24.99, or leave it blank';
  if (Number.isNaN(stock)) errors.stock = 'Enter a whole number';
  if (Number.isNaN(couponPct)) errors.couponPct = 'Enter a whole percent like 15, or leave it blank';
  if (Number.isNaN(maxPerCustomer)) errors.maxPerCustomer = 'Enter a whole number like 3, or leave it blank';
  if (details.error) errors.details = details.error;
  if (kept.length + galleryUploads.length > GALLERY_MAX) errors.gallery = `Up to ${GALLERY_MAX} more images; remove ${kept.length + galleryUploads.length - GALLERY_MAX}`;
  const badFile = galleryUploads.map(imageFileError).find(Boolean);
  if (badFile) errors.gallery ??= badFile;
  if (Object.keys(errors).length) return back(errors);

  let saved: string;
  try {
    if (upload) input.image = await uploadProductImage(client, store.id, upload);
    values.image = input.image;
    const uploaded = [];
    for (const f of galleryUploads) uploaded.push(await uploadProductImage(client, store.id, f, 'gallery'));
    input.gallery = [...kept, ...uploaded];
    values.gallery = input.gallery.join('\n');
    if (id) {
      await updateProduct(client, id, input);
      saved = id;
    } else {
      saved = await createProduct(client, store.id, input);
    }
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    const field = err.detail && LATE_FIELDS.has(err.detail) ? err.detail : err.code === 'invalid_category' ? 'category' : null;
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

/**
 * Take a product off sale, or put it back. `from` is where the button was: the edit page, or the
 * list's Active / Archived tab (the redirect goes back there).
 */
export async function archiveProduct(id: string, archived: boolean, from: 'edit' | 'active' | 'archived'): Promise<void> {
  const store = await getMarketplace();
  const { client, error } = await adminClient();
  const edit = storePath(store, `/admin/products/${encodeURIComponent(id)}`);
  if (error) redirect(`${edit}?error=forbidden`);
  try {
    await setArchived(client, id, archived);
  } catch (err) {
    if (err instanceof DataError) redirect(`${edit}?error=${err.code}`);
    throw err;
  }
  revalidatePath('/', 'layout');
  const done = archived ? 'archived' : 'restored';
  if (from === 'edit') redirect(`${edit}?done=${done}`);
  const tab = from === 'archived' ? 'status=archived&' : '';
  redirect(storePath(store, `/admin/products?${tab}done=${done}&id=${encodeURIComponent(id)}`));
}
