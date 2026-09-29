import { requireAdmin } from '../data/admin-catalog';
import { requireUser, type ApiContext } from './http';

/** Signed in + in public.admins; the database enforces the same rule on every write. */
export async function adminOnly(ctx: ApiContext): Promise<void> {
  requireUser(ctx);
  await requireAdmin(ctx.db);
}
