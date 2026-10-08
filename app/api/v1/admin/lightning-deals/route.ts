import { adminOnly } from '@/lib/api/admin';
import { body, json, preflight, route } from '@/lib/api/http';
import { getAdminProduct } from '@/lib/data/admin-catalog';
import { dealView, getAdminLightningDeal, listAdminLightningDeals, scheduleLightningDeal } from '@/lib/data/admin-lightning-deals';
import { DataError } from '@/lib/data/errors';

/**
 * GET /api/v1/admin/lightning-deals?view= — this store's Lightning Deals. view: live (the default,
 * ending soonest first) | upcoming (starting soonest first) | ended (the latest 50). `counts` has
 * how many are live and upcoming.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  return json(await listAdminLightningDeals(ctx.db, ctx.market, dealView(ctx.req.nextUrl.searchParams.get('view'))));
});

const whole = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new DataError('invalid_input', field);
  return v;
};

/**
 * POST /api/v1/admin/lightning-deals { productId, dealPriceMinor, quota, hours, startsAt? } —
 * schedule a deal on this store's product: below its price, up to its stock, 1 to 12 hours, from
 * `startsAt` (ISO) or now, when it goes live at once. 201 with the deal.
 */
export const POST = route(async (ctx) => {
  await adminOnly(ctx);
  const input = await body(ctx.req);
  const productId = typeof input.productId === 'string' ? input.productId : '';
  const product = productId ? await getAdminProduct(ctx.db, productId) : null;
  if (!product || product.market !== ctx.market) throw new DataError('product_not_found');
  let startsAt: string | null = null;
  if (input.startsAt != null) {
    if (typeof input.startsAt !== 'string' || Number.isNaN(Date.parse(input.startsAt))) throw new DataError('invalid_input', 'starts_at');
    startsAt = new Date(input.startsAt).toISOString();
  }
  const id = await scheduleLightningDeal(ctx.db, {
    productId,
    dealPriceMinor: whole(input.dealPriceMinor, 'deal_price_minor'),
    quota: whole(input.quota, 'quota'),
    hours: whole(input.hours, 'hours'),
    startsAt,
  });
  return json({ deal: await getAdminLightningDeal(ctx.db, ctx.market, id) }, { status: 201 });
});

export const OPTIONS = preflight;
