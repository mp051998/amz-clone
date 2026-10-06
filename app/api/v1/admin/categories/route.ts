import { adminOnly } from '@/lib/api/admin';
import { body, json, preflight, route } from '@/lib/api/http';
import { createCategory, listAdminCategories, storeNav } from '@/lib/data/admin-categories';
import { DataError } from '@/lib/data/errors';

/**
 * GET /api/v1/admin/categories — every category with each store's listing and product counts,
 * plus this store's nav order (`nav`, slugs).
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  const categories = await listAdminCategories(ctx.db);
  return json({ market: ctx.market, nav: storeNav(categories, ctx.market).map((c) => c.slug), categories });
});

/**
 * POST /api/v1/admin/categories { name, slug?, listed? } — create a category (slug from the name
 * when omitted), listed last in this store's nav unless `listed: false`; 201 with its slug.
 */
export const POST = route(async (ctx) => {
  await adminOnly(ctx);
  const b = await body(ctx.req);
  if ('listed' in b && typeof b.listed !== 'boolean') throw new DataError('invalid_input', 'listed', 'listed must be true or false');
  const slug = await createCategory(ctx.db, { name: b.name, slug: b.slug }, b.listed === false ? undefined : ctx.market);
  const category = (await listAdminCategories(ctx.db)).find((c) => c.slug === slug);
  return json({ category }, { status: 201 });
});

export const OPTIONS = preflight;
