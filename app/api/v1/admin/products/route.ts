import { adminOnly } from '@/lib/api/admin';
import { body, intParam, json, preflight, route } from '@/lib/api/http';
import { ADMIN_PAGE_SIZE, createProduct, getAdminProduct, listAdminProducts, productStatus } from '@/lib/data/admin-catalog';

/**
 * GET /api/v1/admin/products?status=&q=&category=&page= — this store's products on sale
 * (`status=archived`: taken off sale), most recently changed first.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  const p = ctx.req.nextUrl.searchParams;
  return json(
    await listAdminProducts(ctx.db, ctx.market, {
      q: p.get('q') ?? undefined,
      category: p.get('category') ?? undefined,
      status: productStatus(p.get('status')),
      page: intParam(p.get('page'), 1, 1, 10_000),
      pageSize: intParam(p.get('pageSize'), ADMIN_PAGE_SIZE, 1, 100),
    }),
  );
});

/** POST /api/v1/admin/products — add a product to this store; 201 with the product. */
export const POST = route(async (ctx) => {
  await adminOnly(ctx);
  const id = await createProduct(ctx.db, ctx.market, await body(ctx.req));
  return json({ product: await getAdminProduct(ctx.db, id) }, { status: 201 });
});

export const OPTIONS = preflight;
