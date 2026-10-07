import { body, noContent, preflight, route } from '@/lib/api/http';
import { recordView } from '@/lib/data/also-viewed';

/**
 * POST /api/v1/products/:id/views — count a product page view with `recent`, the products this
 * device looked at just before (newest first), for "Customers who viewed this item also viewed".
 * `204`, also when nothing is counted.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  const input = await body(ctx.req);
  await recordView(ctx.db, id, input.recent);
  return noContent();
});

export const OPTIONS = preflight;
