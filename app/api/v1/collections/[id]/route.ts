import { body, json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { deleteCollection, getCollection, isUuid, updateCollection } from '@/lib/data/collections';
import { DataError } from '@/lib/data/errors';

/** GET /api/v1/collections/:id — one of the caller's collections, with items. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const collection = isUuid(id) ? await getCollection(ctx.db, id) : null;
  if (!collection) throw new DataError('collection_not_found');
  return json({ collection });
});

/** PATCH /api/v1/collections/:id { name?, note? } — rename and/or edit the note. */
export const PATCH = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const collection = await updateCollection(ctx.db, id, { name: b.name, note: b.note });
  return json({ collection });
});

/** DELETE /api/v1/collections/:id — delete a collection and its items. */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  await deleteCollection(ctx.db, id);
  return noContent();
});

export const OPTIONS = preflight;
