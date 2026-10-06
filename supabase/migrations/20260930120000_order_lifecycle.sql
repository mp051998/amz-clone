-- Order lifecycle: every placed order gets a saved delivery schedule (it still
-- progresses on its own), shoppers can cancel before it ships and admins before
-- it's delivered, and a cancelled paid order records its refund. Admins read
-- and act on orders through SECURITY DEFINER functions only: there is no
-- admin RLS policy on orders, so shopper queries stay scoped to their owner.
-- Design: docs/superpowers/specs/2026-09-30-order-lifecycle-design.md

-- ---------------------------------------------------------------------------
-- Each store's time zone: deliveries happen in local daytime.
-- ---------------------------------------------------------------------------
alter table public.markets add column time_zone text not null default 'UTC';
update public.markets set time_zone = case id when 'IN' then 'Asia/Kolkata' else 'America/Los_Angeles' end;

-- ---------------------------------------------------------------------------
-- Schedule, cancellation and refund columns
-- ---------------------------------------------------------------------------
alter table public.orders
  add column shipped_at            timestamptz,
  add column out_for_delivery_at   timestamptz,
  add column delivered_at          timestamptz,
  add column cancel_reason         text check (cancel_reason in ('customer', 'admin', 'sold_out')),
  add column refund_status         text check (refund_status in ('pending', 'succeeded', 'failed', 'not_charged')),
  add column refund_minor          integer check (refund_minor >= 0),
  add column refunded_at           timestamptz,
  add column stripe_payment_intent text,
  add column stripe_refund_id      text,
  add constraint orders_schedule_in_order check (
    shipped_at <= out_for_delivery_at and out_for_delivery_at <= delivered_at
  );

create index orders_market_placed_idx on public.orders (market_id, placed_at desc);

-- ---------------------------------------------------------------------------
-- Schedule helpers
-- ---------------------------------------------------------------------------

-- Out for delivery at 09:00 local on the first day (counted from shipped + 14 h)
-- that leaves at least 6 h after shipping; delivered at 11:30 local that day.
-- Mirrors plannedSchedule() in lib/decision/tracking.ts.
create function private.delivery_after(
  p_shipped timestamptz,
  p_tz text,
  out out_for_delivery timestamptz,
  out delivered timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_day date := ((p_shipped + interval '14 hours') at time zone p_tz)::date;
begin
  loop
    out_for_delivery := (v_day + time '09:00') at time zone p_tz;
    exit when out_for_delivery >= p_shipped + interval '6 hours';
    v_day := v_day + 1;
  end loop;
  delivered := (v_day + time '11:30') at time zone p_tz;
end
$$;

-- Where an order is now: awaiting_payment | cancelled | preparing | shipped |
-- out_for_delivery | delivered — the latest saved stage time that has passed.
create function private.order_stage(p_status text, p_shipped timestamptz, p_out timestamptz, p_delivered timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status <> 'placed' then p_status
    when p_delivered <= now() then 'delivered'
    when p_out <= now() then 'out_for_delivery'
    when p_shipped <= now() then 'shipped'
    else 'preparing'
  end
$$;

-- Fill the schedule the moment an order is placed (non-card orders on insert,
-- card orders when Stripe confirms), so neither place_order nor
-- confirm_order_payment has to change.
create function public.orders_fill_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_d  record;
begin
  if new.status = 'placed' and new.placed_at is not null and new.shipped_at is null then
    select m.time_zone into v_tz from public.markets m where m.id = new.market_id;
    new.shipped_at := new.placed_at + interval '10 hours';
    select * into v_d from private.delivery_after(new.shipped_at, coalesce(v_tz, 'UTC'));
    new.out_for_delivery_at := v_d.out_for_delivery;
    new.delivered_at := v_d.delivered;
  end if;
  return new;
end
$$;

revoke execute on function public.orders_fill_schedule() from public, anon, authenticated;

create trigger orders_fill_schedule
  before insert or update of status, placed_at on public.orders
  for each row execute function public.orders_fill_schedule();

-- Orders placed before this migration get the schedule they were already showing.
update public.orders o
   set shipped_at = s.shipped_at,
       out_for_delivery_at = s.out_for_delivery,
       delivered_at = s.delivered
  from (
    select o2.id, o2.placed_at + interval '10 hours' as shipped_at, d.out_for_delivery, d.delivered
    from public.orders o2
    join public.markets m on m.id = o2.market_id
    cross join lateral private.delivery_after(o2.placed_at + interval '10 hours', m.time_zone) d
    where o2.status = 'placed' and o2.placed_at is not null and o2.shipped_at is null
  ) s
 where s.id = o.id;

-- ---------------------------------------------------------------------------
-- Cancellation
-- ---------------------------------------------------------------------------

-- Cancel a placed order (caller has locked it and checked the window): stock
-- goes back, and the refund is recorded by payment method. Card refunds start
-- 'pending' until the server has refunded on Stripe; cash on delivery was never
-- charged; the other methods are simulated, so their refund is immediate.
create function private.cancel_placed_order(p_order_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders o
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = p_reason,
         refund_minor = o.total_minor,
         refund_status = case o.payment_method when 'card' then 'pending' when 'cod' then 'not_charged' else 'succeeded' end,
         refunded_at = case when o.payment_method in ('card', 'cod') then null else now() end
   where o.id = p_order_id and o.status = 'placed';
  if not found then
    raise exception 'order_not_cancellable' using errcode = 'P0001';
  end if;

  update public.products p
     set stock = p.stock + oi.qty
    from public.order_items oi
   where oi.order_id = p_order_id and p.id = oi.product_id;
end
$$;

/**
 * Shopper cancels one of their orders: an unpaid one as before, a placed one
 * until it ships (409 order_not_cancellable after). Cancelling a cancelled
 * order is a no-op.
 */
create function public.cancel_my_order(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o record;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select o.status, o.shipped_at, o.out_for_delivery_at, o.delivered_at into v_o
  from public.orders o
  where o.id = p_order_id and o.user_id = auth.uid()
  for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_o.status = 'awaiting_payment' then
    perform private.cancel_order(p_order_id);
  elsif v_o.status = 'placed' then
    if private.order_stage(v_o.status, v_o.shipped_at, v_o.out_for_delivery_at, v_o.delivered_at) <> 'preparing' then
      raise exception 'order_not_cancellable' using errcode = 'P0001';
    end if;
    perform private.cancel_placed_order(p_order_id, 'customer');
  end if;
  return private.order_json(p_order_id);
end
$$;

-- ---------------------------------------------------------------------------
-- Payments and refunds (server-only: the service role after talking to Stripe)
-- ---------------------------------------------------------------------------

-- Remember the PaymentIntent that paid a card order (best-effort, after confirm).
create function public.record_payment_intent(p_order_id text, p_payment_intent text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders o
     set stripe_payment_intent = p_payment_intent
   where o.id = p_order_id and o.payment_method = 'card' and o.stripe_payment_intent is null
$$;

-- Stripe's word on a refund. A late 'pending' never overwrites 'succeeded', and
-- a failure reported for some other (older) refund than the one on record is ignored.
create function public.record_refund(p_order_id text, p_refund_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'succeeded', 'failed') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  update public.orders o
     set stripe_refund_id = coalesce(p_refund_id, o.stripe_refund_id),
         refund_status = p_status,
         refunded_at = case when p_status = 'succeeded' then coalesce(o.refunded_at, now()) end
   where o.id = p_order_id
     and o.refund_status in ('pending', 'succeeded', 'failed')
     and not (o.refund_status = 'succeeded' and p_status = 'pending')
     and not (p_status = 'failed' and p_refund_id is not null and o.stripe_refund_id is not null
              and o.stripe_refund_id <> p_refund_id);
end
$$;

-- A card payment arrived after the order's reserved stock was released and
-- sold (confirm_order_payment raised stock_released): the order stays
-- cancelled and is owed a full refund.
create function public.mark_sold_out(p_order_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders o
     set cancel_reason = coalesce(o.cancel_reason, 'sold_out'),
         refund_minor = coalesce(o.refund_minor, o.total_minor),
         refund_status = coalesce(o.refund_status, 'pending')
   where o.id = p_order_id and o.status = 'cancelled' and o.payment_method = 'card'
$$;

-- ---------------------------------------------------------------------------
-- Store admins
-- ---------------------------------------------------------------------------

create function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end
$$;

-- One order as the admin pages see it: the order JSON plus its stage and customer.
create function private.admin_order_json(p_order_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.order_json(o.id) || jsonb_build_object(
    'stage', private.order_stage(o.status, o.shipped_at, o.out_for_delivery_at, o.delivered_at),
    'customer', jsonb_build_object('id', o.user_id, 'email', u.email, 'name', pr.display_name)
  )
  from public.orders o
  left join auth.users u on u.id = o.user_id
  left join public.profiles pr on pr.id = o.user_id
  where o.id = p_order_id
$$;

create function public.admin_get_order(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.require_admin();
  v := private.admin_order_json(p_order_id);
  if v is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  return v;
end
$$;

/**
 * A store's orders for the admin list. Filters: all | preparing | shipped
 * (shipped or out for delivery) | delivered | cancelled | refund_issues
 * (refund pending or failed). `p_q` matches an order id prefix or part of the
 * customer's email. Orders that were never placed or charged (abandoned
 * checkouts) are left out. Counts per filter ignore the search.
 */
create function public.admin_list_orders(
  p_market    text,
  p_filter    text default 'all',
  p_q         text default null,
  p_page      integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_filter text := coalesce(p_filter, 'all');
  v_q      text := nullif(btrim(coalesce(p_q, '')), '');
  v_like   text;
  v_size   integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_page   integer := greatest(coalesce(p_page, 1), 1);
  v_out    jsonb;
begin
  perform private.require_admin();
  if v_filter not in ('all', 'preparing', 'shipped', 'delivered', 'cancelled', 'refund_issues') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'filter';
  end if;
  v_like := replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_');

  with base as (
    select o.id, o.status, o.currency, o.payment_method, o.payment_label, o.total_minor,
           o.created_at, o.placed_at, o.cancelled_at, o.cancel_reason, o.refund_status, o.ship_name,
           coalesce(o.placed_at, o.created_at) as sort_at,
           private.order_stage(o.status, o.shipped_at, o.out_for_delivery_at, o.delivered_at) as stage,
           u.email, pr.display_name
    from public.orders o
    left join auth.users u on u.id = o.user_id
    left join public.profiles pr on pr.id = o.user_id
    where o.market_id = p_market and (o.placed_at is not null or o.refund_status is not null)
  ),
  hit as (
    select b.* from base b
    where (v_filter = 'all'
        or (v_filter = 'preparing' and b.stage = 'preparing')
        or (v_filter = 'shipped' and b.stage in ('shipped', 'out_for_delivery'))
        or (v_filter = 'delivered' and b.stage = 'delivered')
        or (v_filter = 'cancelled' and b.stage = 'cancelled')
        or (v_filter = 'refund_issues' and b.refund_status in ('pending', 'failed')))
      and (v_q is null or b.id ilike v_like || '%' or b.email ilike '%' || v_like || '%')
  ),
  page as (
    select h.* from hit h
    order by h.sort_at desc, h.id
    limit v_size offset (v_page - 1) * v_size
  )
  select jsonb_build_object(
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pg.id, 'status', pg.status, 'stage', pg.stage, 'currency', pg.currency,
        'payment_method', pg.payment_method, 'payment_label', pg.payment_label, 'total_minor', pg.total_minor,
        'created_at', pg.created_at, 'placed_at', pg.placed_at, 'cancelled_at', pg.cancelled_at,
        'cancel_reason', pg.cancel_reason, 'refund_status', pg.refund_status, 'ship_name', pg.ship_name,
        'customer', jsonb_build_object('email', pg.email, 'name', pg.display_name),
        'item_count', (select coalesce(sum(oi.qty), 0) from public.order_items oi where oi.order_id = pg.id),
        'first_title', (select oi.title from public.order_items oi where oi.order_id = pg.id order by oi.line_no limit 1)
      ) order by pg.sort_at desc, pg.id)
      from page pg
    ), '[]'::jsonb),
    'total', (select count(*) from hit),
    'page', v_page,
    'page_size', v_size,
    'counts', (
      select jsonb_build_object(
        'all', count(*),
        'preparing', count(*) filter (where stage = 'preparing'),
        'shipped', count(*) filter (where stage in ('shipped', 'out_for_delivery')),
        'delivered', count(*) filter (where stage = 'delivered'),
        'cancelled', count(*) filter (where stage = 'cancelled'),
        'refund_issues', count(*) filter (where refund_status in ('pending', 'failed'))
      )
      from base
    )
  ) into v_out;
  return v_out;
end
$$;

-- Lock an order for an admin action; raises order_not_found.
create function private.admin_lock_order(p_order_id text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.orders;
begin
  perform private.require_admin();
  select * into v from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  return v;
end
$$;

/** Mark shipped now: later stages move up to match. No-op once shipped. */
create function public.admin_ship_order(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v   public.orders := private.admin_lock_order(p_order_id);
  v_d record;
begin
  if v.status <> 'placed' then
    raise exception 'order_not_open' using errcode = 'P0001';
  end if;
  if v.shipped_at is null or v.shipped_at > now() then
    select * into v_d
    from private.delivery_after(now(), (select m.time_zone from public.markets m where m.id = v.market_id));
    update public.orders o
       set shipped_at = now(),
           out_for_delivery_at = least(coalesce(o.out_for_delivery_at, v_d.out_for_delivery), v_d.out_for_delivery),
           delivered_at = least(coalesce(o.delivered_at, v_d.delivered), v_d.delivered)
     where o.id = p_order_id;
  end if;
  return private.admin_order_json(p_order_id);
end
$$;

/** Mark delivered now: every stage still in the future happens now. No-op once delivered. */
create function public.admin_deliver_order(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.orders := private.admin_lock_order(p_order_id);
begin
  if v.status <> 'placed' then
    raise exception 'order_not_open' using errcode = 'P0001';
  end if;
  if v.delivered_at is null or v.delivered_at > now() then
    update public.orders o
       set shipped_at = least(coalesce(o.shipped_at, now()), now()),
           out_for_delivery_at = least(coalesce(o.out_for_delivery_at, now()), now()),
           delivered_at = now()
     where o.id = p_order_id;
  end if;
  return private.admin_order_json(p_order_id);
end
$$;

/** Cancel any order that hasn't been delivered (an unpaid one just releases its stock). */
create function public.admin_cancel_order(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.orders := private.admin_lock_order(p_order_id);
begin
  if v.status = 'awaiting_payment' then
    perform private.cancel_order(p_order_id);
  elsif v.status = 'placed' then
    if private.order_stage(v.status, v.shipped_at, v.out_for_delivery_at, v.delivered_at) = 'delivered' then
      raise exception 'order_not_cancellable' using errcode = 'P0001';
    end if;
    perform private.cancel_placed_order(p_order_id, 'admin');
  end if;
  return private.admin_order_json(p_order_id);
end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.cancel_my_order(text) from public, anon;
revoke execute on function public.record_payment_intent(text, text) from public, anon, authenticated;
revoke execute on function public.record_refund(text, text, text) from public, anon, authenticated;
revoke execute on function public.mark_sold_out(text) from public, anon, authenticated;
revoke execute on function public.admin_get_order(text) from public, anon;
revoke execute on function public.admin_list_orders(text, text, text, integer, integer) from public, anon;
revoke execute on function public.admin_ship_order(text) from public, anon;
revoke execute on function public.admin_deliver_order(text) from public, anon;
revoke execute on function public.admin_cancel_order(text) from public, anon;

grant execute on function public.cancel_my_order(text) to authenticated, service_role;
grant execute on function public.record_payment_intent(text, text) to service_role;
grant execute on function public.record_refund(text, text, text) to service_role;
grant execute on function public.mark_sold_out(text) to service_role;
grant execute on function public.admin_get_order(text) to authenticated, service_role;
grant execute on function public.admin_list_orders(text, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_ship_order(text) to authenticated, service_role;
grant execute on function public.admin_deliver_order(text) to authenticated, service_role;
grant execute on function public.admin_cancel_order(text) to authenticated, service_role;
