'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addCategoryToStore,
  createCategory,
  deleteCategory,
  moveCategory,
  removeCategoryFromStore,
  renameCategory,
  validateCategory,
  type CategoryFieldErrors,
} from '@/lib/data/admin-categories';
import type { Db } from '@/lib/db/client';
import { DataError } from '@/lib/data/errors';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import type { Market } from '@/lib/types';
import { adminClient } from '../guard';

/** What the add-category form needs back: field errors, a form-level message, and the values to keep. */
export interface CategoryFormState {
  errors?: CategoryFieldErrors & { form?: string };
  values?: { name: string; slug: string; list: boolean };
}

/** Add a category (optionally listed in this store's nav), then show it on the categories page. */
export async function addCategory(_prev: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  const values = {
    name: String(formData.get('name') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    list: formData.get('list') === 'on',
  };
  const back = (errors: CategoryFormState['errors']): CategoryFormState => ({ errors, values });

  const store = await getMarketplace();
  const { client, error } = await adminClient();
  if (error) return back({ form: error });

  const checked = validateCategory(values);
  if (!checked.ok) return back(checked.errors);
  let slug: string;
  try {
    slug = await createCategory(client, checked.data, values.list ? store.id : undefined);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    return back(err.code === 'category_exists' ? { slug: err.message } : { form: err.message });
  }
  revalidatePath('/', 'layout');
  redirect(storePath(store, `/admin/categories?done=created&slug=${encodeURIComponent(slug)}`));
}

/** Run one category change and come back to the categories page with a notice (or the error). */
async function change(slug: string, done: string, run: (client: Db, market: Market) => Promise<void>) {
  const store = await getMarketplace();
  const page = (qs: string) => storePath(store, `/admin/categories?${qs}&slug=${encodeURIComponent(slug)}`);
  const { client, error } = await adminClient();
  if (error) redirect(page('error=forbidden'));
  try {
    await run(client, store.id);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    const msg = err.code === 'invalid_input' ? `&edit=${encodeURIComponent(slug)}&msg=${encodeURIComponent(err.message)}` : '';
    redirect(page(`error=${err.code}${msg}`));
  }
  revalidatePath('/', 'layout');
  redirect(page(`done=${done}`));
}

export async function renameCategoryAction(slug: string, formData: FormData): Promise<void> {
  await change(slug, 'renamed', (client) => renameCategory(client, slug, formData.get('name')));
}

/** List the category in this store's nav (last), or stop listing it. */
export async function setListed(slug: string, listed: boolean): Promise<void> {
  await change(slug, listed ? 'listed' : 'unlisted', (client, market) =>
    listed ? addCategoryToStore(client, market, slug) : removeCategoryFromStore(client, market, slug),
  );
}

/** One place up (-1) or down (1) in this store's nav. */
export async function moveCategoryAction(slug: string, offset: number): Promise<void> {
  await change(slug, 'moved', (client, market) => moveCategory(client, market, slug, offset));
}

export async function deleteCategoryAction(slug: string): Promise<void> {
  await change(slug, 'deleted', (client) => deleteCategory(client, slug));
}
