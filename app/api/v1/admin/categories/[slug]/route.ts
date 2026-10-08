import { adminOnly } from '@/lib/api/admin';
import { body, json, noContent, preflight, route, type ApiContext } from '@/lib/api/http';
import {
  addCategoryToStore,
  deleteCategory,
  listAdminCategories,
  moveCategory,
  removeCategoryFromStore,
  renameCategory,
} from '@/lib/data/admin-categories';
import { DataError } from '@/lib/data/errors';
import { parseReturnDays, setCategoryReturnDays } from '@/lib/data/return-policy';

async function load(ctx: ApiContext, slug: string) {
  const category = (await listAdminCategories(ctx.db)).find((c) => c.slug === slug);
  if (!category) throw new DataError('category_not_found');
  return category;
}

/**
 * PATCH /api/v1/admin/categories/:slug { name?, listed?, move?, returnDays? } — rename; list in
 * (`true`) or drop from (`false`) this store's nav (`category_in_use` while the store has products
 * in it); `move` by that many places (negative = earlier); `returnDays` sets its return window in
 * this store (0 = not returnable, null = the store's), for orders placed from now on. The slug
 * itself never changes.
 */
export const PATCH = route<{ slug: string }>(async (ctx, { slug }) => {
  await adminOnly(ctx);
  await load(ctx, slug);
  const b = await body(ctx.req);
  if ('listed' in b && typeof b.listed !== 'boolean') throw new DataError('invalid_input', 'listed', 'listed must be true or false');
  if ('move' in b && !Number.isInteger(b.move)) throw new DataError('invalid_input', 'move', 'move must be a whole number');
  if ('returnDays' in b && b.returnDays !== null && typeof b.returnDays !== 'number') throw new DataError('invalid_input', 'return_days', 'returnDays must be a number of days or null');
  const returnDays = 'returnDays' in b ? parseReturnDays(b.returnDays) : undefined;
  if ('name' in b) await renameCategory(ctx.db, slug, b.name);
  if (b.listed === true) await addCategoryToStore(ctx.db, ctx.market, slug);
  if (b.listed === false) await removeCategoryFromStore(ctx.db, ctx.market, slug);
  if (typeof b.move === 'number' && b.move !== 0) await moveCategory(ctx.db, ctx.market, slug, b.move);
  if (returnDays !== undefined) await setCategoryReturnDays(ctx.db, ctx.market, slug, returnDays);
  return json({ category: await load(ctx, slug) });
});

/** DELETE /api/v1/admin/categories/:slug — 204; `category_in_use` (409) while any product uses it. */
export const DELETE = route<{ slug: string }>(async (ctx, { slug }) => {
  await adminOnly(ctx);
  await deleteCategory(ctx.db, slug);
  return noContent();
});

export const OPTIONS = preflight;
