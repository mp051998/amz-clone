import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { cancelSubscription, updateSubscription } from '@/lib/data/subscriptions';
import { intField, stringField } from '../fields';

/**
 * PATCH /api/v1/me/subscriptions/:id { qty?, everyMonths?, addressId?, paymentMethod? } — change
 * an active subscription; what's left out stays. `{subscription}`. `404 subscription_not_found`
 * unless it's the caller's and active, `404 address_not_found`, `422 payment_method_unavailable` /
 * `invalid_input`.
 */
export const PATCH = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const subscription = await updateSubscription(ctx.db, id, {
    qty: intField(b, 'qty'),
    everyMonths: intField(b, 'everyMonths'),
    addressId: stringField(b, 'addressId'),
    paymentMethod: stringField(b, 'paymentMethod'),
  });
  return json({ subscription });
});

/** DELETE /api/v1/me/subscriptions/:id — cancel it: `{subscription}` (status `cancelled`). Orders placed stay. */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ subscription: await cancelSubscription(ctx.db, id) });
});

export const OPTIONS = preflight;
