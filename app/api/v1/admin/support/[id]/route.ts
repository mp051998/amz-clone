import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { getCase } from '@/lib/data/support';

/** GET /api/v1/admin/support/:id — one of this store's cases with its messages, oldest first. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  const thread = await getCase(ctx.db, ctx.market, id, null);
  if (!thread) throw new DataError('case_not_found');
  return json({ case: thread });
});

export const OPTIONS = preflight;
