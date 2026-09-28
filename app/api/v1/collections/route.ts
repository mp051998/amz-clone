import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { createCollection, listCollections } from '@/lib/data/collections';

/** GET /api/v1/collections — the caller's collections in this store, with items (newest first). */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  return json({ collections: await listCollections(ctx.db, ctx.market) });
});

/** POST /api/v1/collections { name, note? } — create a custom collection (max 20). */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const collection = await createCollection(ctx.db, ctx.market, { name: b.name, note: b.note });
  return json({ collection }, { status: 201 });
});

export const OPTIONS = preflight;
