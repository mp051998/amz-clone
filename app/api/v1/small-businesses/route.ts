import { json, preflight, route } from '@/lib/api/http';
import { listSmallBusinesses } from '@/lib/data/small-businesses';

/** GET /api/v1/small-businesses — the brands this store marks as small businesses, by name, each with what it makes. */
export const GET = route(async (ctx) => json({ smallBusinesses: await listSmallBusinesses(ctx.db, ctx.market) }));

export const OPTIONS = preflight;
