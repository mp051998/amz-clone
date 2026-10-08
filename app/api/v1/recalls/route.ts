import { json, preflight, route } from '@/lib/api/http';
import { listRecalls } from '@/lib/data/recalls';

/** GET /api/v1/recalls — this store's product recalls, newest first: each product, its hazard and what to do. */
export const GET = route(async (ctx) => json({ recalls: await listRecalls(ctx.db, ctx.market) }));

export const OPTIONS = preflight;
