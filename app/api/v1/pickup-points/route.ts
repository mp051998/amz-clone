import { json, preflight, route } from '@/lib/api/http';
import { listPickupPoints } from '@/lib/data/pickup';

/**
 * GET /api/v1/pickup-points?q= — the store's Hub Lockers and Hub Counters that take orders, by
 * city: `{pickupPoints: [{id, kind, name, line1, city, state, postcode, hours, holdDays}]}`.
 * `q` keeps those whose name, street, city or postcode contains it. Send an `id` as
 * `shipping.pickupPoint` on `POST /orders` to collect the order there.
 */
export const GET = route(async (ctx) => {
  const q = (ctx.req.nextUrl.searchParams.get('q') ?? '').slice(0, 60);
  return json({ pickupPoints: await listPickupPoints(ctx.db, ctx.market, q) });
});

export const OPTIONS = preflight;
