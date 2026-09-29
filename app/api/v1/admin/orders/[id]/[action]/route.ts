import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { adminCancelOrder, deliverOrder, getStoreOrder, retryRefund, shipOrder } from '@/lib/data/admin-orders';
import { DataError } from '@/lib/data/errors';

const ACTIONS = { ship: shipOrder, deliver: deliverOrder, cancel: adminCancelOrder, refund: retryRefund } as const;

/**
 * POST /api/v1/admin/orders/:id/{ship,deliver,cancel,refund}
 * - ship: shipped now (placed orders); deliver: delivered now; both are no-ops when already done.
 * - cancel: until delivered; stock returned, card payments refunded on Stripe.
 * - refund: retry a card refund that failed (`refund_failed`, 502, if it fails again).
 */
export const POST = route<{ id: string; action: string }>(async (ctx, { id, action }) => {
  await adminOnly(ctx);
  if (!Object.hasOwn(ACTIONS, action)) throw new DataError('not_found');
  await getStoreOrder(ctx.db, ctx.market, id);
  return json({ order: await ACTIONS[action as keyof typeof ACTIONS](ctx.db, id) });
});

export const OPTIONS = preflight;
