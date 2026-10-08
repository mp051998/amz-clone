/*
 * Holiday returns, as on amazon.com: what's bought from November 1 to December 31 can go back until
 * January 31, or within its own window from delivery when that ends later, so gifts don't have to be
 * returned before they're given.
 *
 * - markets.holiday_returns: the store has them (the US one does; amazon.in doesn't).
 * - private.holiday_return_by(): the deadline for an order placed then (the end of January 31 in the
 *   store's time zone), or null.
 * - private.return_windows(): as in 20270101090000_category_return_windows.sql, with each product's
 *   window ending at the later of the two. What can't be returned at all stays that way, and
 *   replacement units keep their own window from when they arrive. order_returns(), request_return()
 *   and the rest read it, so they follow without changing.
 */

alter table public.markets add column holiday_returns boolean not null default false;
update public.markets set holiday_returns = true where id = 'US';

create function private.holiday_return_by(p_market text, p_placed timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select make_timestamp(extract(year from t.local)::integer + 1, 1, 31, 23, 59, 59) at time zone m.time_zone
  from public.markets m
  cross join lateral (select p_placed at time zone m.time_zone as local) t
  where m.id = p_market and m.holiday_returns and extract(month from t.local) >= 11
$$;

revoke execute on function private.holiday_return_by(text, timestamptz) from public, anon, authenticated;

create or replace function private.return_windows(p_order_id text)
returns table (line_no integer, product_id text, left_qty integer, return_by timestamptz, closed_by timestamptz,
               open_qty integer, replace_qty integer)
language sql
stable
security definer
set search_path = ''
as $$
  with o as (
    select ord.id, ord.delivered_at, m.return_days, private.holiday_return_by(ord.market_id, ord.placed_at) as holiday_by
    from public.orders ord
    join public.markets m on m.id = ord.market_id
    where ord.id = p_order_id and ord.status = 'placed' and ord.delivered_at <= now()
  ),
  days as (
    -- each product's window: its category's when ordered, else the store's
    select oi.product_id, max(coalesce(oi.return_days, o.return_days)) as days
    from o
    join public.order_items oi on oi.order_id = o.id
    group by oi.product_id
  ),
  span as (
    -- and when it ends for what was delivered: that many days on, or the holiday deadline if later
    select d.product_id, make_interval(days => d.days) as span,
           greatest(o.delivered_at + make_interval(days => d.days), case when d.days > 0 then o.holiday_by end) as ends
    from o
    cross join days d
  ),
  rep as (
    -- replacement units delivered so far, how many are still inside their own window, and when the last closed one shut
    select ri.product_id,
           max(r.replacement_delivered_at) as last_at,
           coalesce(sum(ri.qty) filter (where now() <= r.replacement_delivered_at + s.span), 0)::integer as open_qty,
           max(r.replacement_delivered_at + s.span) filter (where r.replacement_delivered_at + s.span < now()) as closed_at
    from o
    join public.returns r on r.order_id = o.id
    join public.return_items ri on ri.return_id = r.id
    join span s on s.product_id = ri.product_id
    where r.resolution = 'replacement' and r.status in ('requested', 'received') and r.replacement_delivered_at <= now()
    group by ri.product_id
  ),
  late as (
    -- refunds started after the product's own window closed can only have been replacement units
    select ri.product_id, sum(ri.qty)::integer as qty
    from o
    join public.returns r on r.order_id = o.id
    join public.return_items ri on ri.return_id = r.id
    join span s on s.product_id = ri.product_id
    where r.resolution = 'refund' and r.status in ('requested', 'received') and r.created_at > s.ends
    group by ri.product_id
  )
  select x.line_no, x.product_id, x.left_qty,
         greatest(s.ends, rep.last_at + s.span),
         greatest(s.ends, rep.closed_at),
         (case
            when now() <= s.ends then x.left_qty
            else greatest(least(x.left_qty, coalesce(rep.open_qty, 0) - coalesce(late.qty, 0)), 0)
          end)::integer,
         -- a replacement is swapped once, inside the product's own window; after it, replacements are refund-only
         (case when now() <= s.ends then x.unreplaced_qty else 0 end)::integer
  from o
  cross join private.return_counts(o.id) x
  join span s on s.product_id = x.product_id
  left join rep on rep.product_id = x.product_id
  left join late on late.product_id = x.product_id
$$;

revoke execute on function private.return_windows(text) from public, anon, authenticated;
