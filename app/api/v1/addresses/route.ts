import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { createAddress, listAddresses } from '@/lib/data/addresses';

/** GET /api/v1/addresses?market=US — the caller's address book for this store (default first). */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  return json({ addresses: await listAddresses(ctx.db, ctx.market) });
});

/**
 * POST /api/v1/addresses { fullName, phone, line1, line2?, landmark?, city, state, postcode, addressType?, instructions?, makeDefault? }
 * Validated per store (US ZIP vs IN PIN, IN requires line2). Max 5 per store.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  return json({ address: await createAddress(ctx.db, ctx.market, b, b.makeDefault === true) }, { status: 201 });
});

export const OPTIONS = preflight;
