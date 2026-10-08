import { json, preflight, route } from '@/lib/api/http';
import { listExchangeDevices } from '@/lib/data/exchange';
import { DataError } from '@/lib/data/errors';
import { isExchangeKind } from '@/lib/exchange';

/**
 * GET /api/v1/exchange-devices[?kind=phone|laptop] — the old phones and laptops the store takes:
 * amazon.in's in exchange on a new one, amazon.com's for Trade-In (POST /me/trade-ins).
 * `{devices: [{id, kind, brand, model, valueMinor}]}` by brand then model. `valueMinor` is a
 * working one with an undamaged screen: half that with a cracked or marked one, and in exchange
 * never more than half the new product's price (GET /orders/buy-now quotes the exact value).
 */
export const GET = route(async (ctx) => {
  const kind = ctx.req.nextUrl.searchParams.get('kind') || null;
  if (kind != null && !isExchangeKind(kind)) throw new DataError('invalid_input', 'kind', 'kind must be phone or laptop.');
  return json({ devices: await listExchangeDevices(ctx.db, ctx.market, kind ?? undefined) });
});

export const OPTIONS = preflight;
