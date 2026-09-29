# Order lifecycle, cancellations with refunds, admin orders

Status: approved 2026-09-30. Builds on the catalog admin work (PR #5).

## Problem

- Delivery progress is computed on the fly in `lib/decision/tracking.ts` from the time an order was placed. The database only knows `placed`, so nobody can move an order along, the server can't enforce "cancel before it ships", and admins have nothing to act on.
- A placed order can't be cancelled at all, and nothing ever refunds a Stripe payment. The one path that promises a refund (`stock_released`: paid after the reserved stock was released and resold) never issues one.
- Admins can't see orders.

## Goals

1. Store each order's delivery schedule; progress stays automatic, admins can move it forward.
2. Shoppers cancel before shipping, admins before delivery; card payments are refunded on Stripe, simulated methods are marked refunded.
3. `/admin/orders`: list, search, filter by stage, order detail, and the actions above.

Out of scope: returns (after delivery), cancelling single items, partial refunds, a carrier feed.

## 1. Stored schedule

New columns on `orders`: `shipped_at`, `out_for_delivery_at`, `delivered_at` (timestamptz, null until the order is placed). New `markets.time_zone` (`America/Los_Angeles` for US, `Asia/Kolkata` for IN; matches `store.dates.timeZone`).

- A `before insert or update` trigger fills the schedule when `placed_at` is set and `shipped_at` is still null. This covers `place_order` (non-card orders) and `confirm_order_payment` (card) without redefining either function.
- The schedule uses today's timings: shipped at `placed_at + 10h`; out for delivery at 09:00 local on the first local day, counted from `shipped + 14h`, that is at least 6 h after shipping; delivered at 11:30 local that day. `private.delivery_after(shipped, tz)` computes the last two, so shipping early reuses it.
- Existing placed orders are backfilled from `placed_at`.
- `status` keeps its three values. The **stage** is derived: `awaiting_payment`, `cancelled`, otherwise the latest saved time that has passed — `delivered`, `out_for_delivery`, `shipped`, else `preparing`. `private.order_stage(orders)` in SQL; `orderStage()` in TypeScript from the same columns.
- `Preparing shipment` stays a display step at `placed + 2h`, capped before `shipped_at`.

Admin moves (only on `placed` orders, never backwards; repeating one is a no-op):
- **Mark shipped now** (stage `preparing`): `shipped_at = now()`, then `out_for_delivery_at` / `delivered_at` = the earlier of their current value and `delivery_after(now)`.
- **Mark delivered now** (stage before `delivered`): every stage time still in the future becomes `now()`.
- A cancelled or unpaid order → `409 order_not_open`.

`tracking.ts` reads the saved times when present. Its own plan remains for unpaid orders (an estimate) and for rows without a schedule (the deploy window before the migration lands).

## 2. Cancel and refund

New columns on `orders`: `cancel_reason` (`customer` | `admin` | `sold_out`), `refund_status` (`pending` | `succeeded` | `failed` | `not_charged`), `refund_minor`, `refunded_at`, `stripe_payment_intent`, `stripe_refund_id`. All null for orders that were never paid; an abandoned unpaid checkout keeps today's "No payment was taken".

Windows (whole order only):
- shopper: while the stage is `preparing` (`shipped_at > now()`);
- admin: until the stage is `delivered`.
Outside the window → `409 order_not_cancellable`.

`private.cancel_placed_order(id, reason)` locks the order, sets `status = 'cancelled'`, `cancelled_at`, `cancel_reason`, `refund_minor = total_minor`, returns the stock, and sets the refund state by payment method:

| Method | `refund_status` |
|---|---|
| `card` | `pending` — the server then refunds on Stripe |
| `cod` | `not_charged` |
| `upi`, `netbanking`, `emi`, `amazonpay`, `giftcard` (simulated) | `succeeded`, `refunded_at = now()` |

Public entry points: `cancel_my_order(id)` (owner, shopper window; an unpaid order is cancelled as before) and `admin_cancel_order(id)` (admin window).

Stripe refund (`lib/data/refunds.ts`, server-only, service role):
- PaymentIntent: `orders.stripe_payment_intent`, else read from the order's Checkout Session. `confirmSession` stores it best-effort through `record_payment_intent` (a separate RPC, so the confirm call never depends on the new migration).
- Idempotent by state: list the PaymentIntent's refunds; if one is `pending`, `requires_action` or `succeeded`, record that one. Otherwise create a refund for `refund_minor` with `metadata.orderId`, idempotency key `refund-<order>-<n>` (n = refunds already on the PaymentIntent).
- The result is saved with `record_refund(id, refund_id, status)`: Stripe `succeeded` → `succeeded` + `refunded_at`; `pending` / `requires_action` → `pending`; `failed` / `canceled` → `failed`. A Stripe error → `failed`, the cancel itself stands, and admin gets **Retry refund**.
- Webhook: `refund.created`, `refund.updated` and `refund.failed` update the order found by `metadata.orderId` (else by PaymentIntent). A failure reported for a refund other than the one on record is ignored, and a late `pending` never overwrites `succeeded`. The Stripe endpoint needs these events enabled.
- `stock_released`: `confirmSession` marks the (already cancelled) order `cancel_reason = 'sold_out'`, `refund_status = 'pending'` via `mark_sold_out(id)`, refunds it, then reports `stock_released` as before.

Shopper side:
- `listOrders` / `countOrders` include every order that was placed or charged (`placed_at` or `refund_status` set), so cancelled orders stay in the list.
- The order page gets **Cancel order** (two-step) while `preparing`: "You can cancel until it ships, today 6:40 PM."
- A cancelled order shows its refund: "Refund of $34.06 to Visa ending 4242 · issued" (with the 5–10 business day note for cards), "Refund processing", "Nothing was charged (Cash on Delivery)", or "No payment was taken".
- `POST /api/v1/orders/:id/cancel` also cancels placed orders.

## 3. Admin orders

`/admin/orders` and `/in/admin/orders`; the admin nav becomes Products · Categories · Orders.

- **List**: `admin_list_orders(market, filter, q, page, page_size)` (SECURITY DEFINER, `is_admin()`), returns rows with the customer's email and display name, the page, and per-filter counts. Filters: All, Preparing, Shipped (shipped + out for delivery), Delivered, Cancelled, Refund issues (`pending` / `failed`). Search: order id prefix or email substring. The list covers orders that were placed or charged; abandoned checkouts are left out.
- **Detail** `/admin/orders/[id]`: items, totals, address, customer, payment, timeline with the saved times, refund details (status, amount, Stripe refund id). Actions: Mark shipped now, Mark delivered now, Cancel & refund (two-step), Retry refund (`failed`, or `pending` with no refund id).
- Reads: `admin_get_order(id)` and `admin_list_orders(...)`, SECURITY DEFINER behind `is_admin()`, join the customer's email and display name. There's no admin read policy on `orders`: one would also widen the shopper-side queries (`listOrders` runs as the signed-in user), so an admin's own order list would show everyone's orders.
- Writes: `admin_ship_order(id)`, `admin_deliver_order(id)`, `admin_cancel_order(id)`; refund retry is server-side (Stripe) behind an `is_admin()` check.
- API: `GET /api/v1/admin/orders?filter=&q=&page=`, `GET /api/v1/admin/orders/:id`, `POST /api/v1/admin/orders/:id/{ship,deliver,cancel,refund}`.

New errors: `order_not_cancellable` (409), `order_not_open` (409), `refund_failed` (502).

## Deploy order

Vercel deploys before CI applies migrations. Reads tolerate missing columns (fallback schedule, no refund fields). `confirm_order_payment` is unchanged, so payments keep working in the window. New RPCs (cancel, admin) fail until the migration lands.

## Testing

- DB: schedule in both time zones (checked against `plannedSchedule()`); the trigger on payment; stage derivation; shopper and admin windows (tests move the saved times with the service role); stock returned; refund state per method; ship/deliver moves; non-admins can't read other orders or call admin RPCs; `admin_list_orders` filters, counts and search.
- Unit: tracking and stage from saved times; the refund state mapping; the Stripe refund helper against a fake Stripe client (reuse an existing refund, key numbering, error → failed).
- Stripe test mode: a real PaymentIntent refunded through the helper; signed `refund.updated` webhook updates the order.
- Browser: shopper cancel with refund state, admin list / detail / actions.
