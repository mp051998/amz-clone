import { json, preflight, route } from '@/lib/api/http';
import { getSharedList } from '@/lib/data/collections';
import { DataError } from '@/lib/data/errors';

/** GET /api/v1/lists/:token — a list someone shared by link (anyone; no note or saved prices). */
export const GET = route<{ token: string }>(async (ctx, { token }) => {
  const list = await getSharedList(ctx.db, token);
  if (!list) throw new DataError('collection_not_found');
  return json({ list });
});

export const OPTIONS = preflight;
