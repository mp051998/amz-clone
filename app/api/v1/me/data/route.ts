import { json, preflight, requireUser, route } from '@/lib/api/http';
import { exportMyData } from '@/lib/data/my-data';

/** GET /api/v1/me/data — everything the store keeps about the caller, both stores: `{ data }`. */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  return json({ data: await exportMyData(ctx.db, user) });
});

export const OPTIONS = preflight;
