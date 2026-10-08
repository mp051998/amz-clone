import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { reportLowerPrice } from '@/lib/data/lower-price';

/**
 * POST /api/v1/products/:id/lower-price { seenAt, priceMinor, shippingMinor?, url?, store?, city?, seenOn? }
 * — tell the store about a lower price. seenAt: online (url, shippingMinor) | store (store, city?,
 * seenOn YYYY-MM-DD within the last 30 days). priceMinor plus shippingMinor must be under the
 * product's price. Telling it again while your report is open rewrites it: 201 for a new report,
 * 200 with `updated: true` for a rewrite.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const { report, updated } = await reportLowerPrice(ctx.db, id, {
    seenAt: b.seenAt,
    priceMinor: b.priceMinor,
    shippingMinor: b.shippingMinor,
    url: b.url,
    store: b.store,
    city: b.city,
    seenOn: b.seenOn,
  });
  return json({ report, updated }, { status: updated ? 200 : 201 });
});

export const OPTIONS = preflight;
