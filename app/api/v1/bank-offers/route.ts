import { json, preflight, route } from '@/lib/api/http';
import { listBankOffers } from '@/lib/data/bank-offers';

/**
 * GET /api/v1/bank-offers — the store's current Bank Offers (amazon.in): `{bankOffers: [{id, bank,
 * methods, percentOff, maxOffMinor, minSpendMinor, endsAt?}]}`, highest cap first. Paying by one of
 * an offer's `methods` (`netbanking`, `emi`) with `bank` named on `POST /orders` takes the best one
 * off the items once they come to `minSpendMinor` after the other discounts: `percentOff` of each
 * unit, scaled down together to stay within `maxOffMinor`. Empty in stores without any.
 */
export const GET = route(async (ctx) => json({ bankOffers: await listBankOffers(ctx.db, ctx.market) }));

export const OPTIONS = preflight;
