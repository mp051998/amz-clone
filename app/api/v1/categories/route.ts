import { json, preflight, route } from '@/lib/api/http';
import { listCategories } from '@/lib/data/catalog';

/** GET /api/v1/categories?market=US — the store's departments in nav order. */
export const GET = route(async (ctx) => json({ market: ctx.market, categories: await listCategories(ctx.db, ctx.market) }));

export const OPTIONS = preflight;
