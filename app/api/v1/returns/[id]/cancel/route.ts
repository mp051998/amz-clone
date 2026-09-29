import { json, preflight, requireUser, route } from '@/lib/api/http';
import { cancelReturn } from '@/lib/data/returns';

/**
 * POST /api/v1/returns/:id/cancel — cancel your return before the items come back.
 * `return_not_open` (409) once it's received, rejected or already cancelled.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ return: await cancelReturn(ctx.db, id) });
});

export const OPTIONS = preflight;
