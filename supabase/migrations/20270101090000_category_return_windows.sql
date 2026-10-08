/*
 * Return windows by category, as on Amazon: most things go back within the store's window, but a
 * category can have its own: shorter (phones and electronics on amazon.in, 7 days), or none at all
 * (beauty there isn't returnable once delivered, for hygiene).
 *
 * - market_categories.return_days: a category's window in a store; null for the store's own
 *   (markets.return_days), 0 for not returnable. Admins set it.
 * - order_items.return_days: the window a line was sold with, kept from when it was ordered (a
 *   later change applies to new orders only); null for the store's.
 * - private.return_windows(): each line's window is now its own, so order_returns() and
 *   request_return(), which read it, follow without changing.
 */

alter table public.market_categories
  add column return_days integer check (return_days between 0 and 365);

grant update (return_days) on public.market_categories to authenticated;

alter table public.order_items
  add column return_days integer check (return_days between 0 and 365);

-- amazon.in: phones, electronics, computers and wearables for 7 days; beauty not returnable. A
-- fresh database gets its categories from the seed, after this, with the store's window.
update public.market_categories set return_days = 7
where market_id = 'IN' and category_slug in ('mobiles', 'electronics', 'computers', 'wearables');
update public.market_categories set return_days = 0
where market_id = 'IN' and category_slug = 'beauty';

-- ---------------------------------------------------------------------------
-- A line keeps the window its category had in the store when it was ordered.
-- ---------------------------------------------------------------------------
create function private.order_item_return_days()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select mc.return_days into new.return_days
  from public.orders o
  join public.products p on p.id = new.product_id
  join public.market_categories mc on mc.market_id = o.market_id and mc.category_slug = p.category_slug
  where o.id = new.order_id;
  return new;
end
$$;

revoke execute on function private.order_item_return_days() from public, anon, authenticated;

create trigger order_items_return_days
  before insert on public.order_items
  for each row execute function private.order_item_return_days();

-- ---------------------------------------------------------------------------
-- private.return_windows: as before (20261207090000_replacement_return_window.sql), with each
-- product's window its own line's rather than the order's. A product on two lines (two sizes)
-- takes the longer.
-- ---------------------------------------------------------------------------
create or replace function private.return_windows(p_order_id text)
returns table (line_no integer, product_id text, left_qty integer, return_by timestamptz, closed_by timestamptz,
               open_qty integer, replace_qty integer)
language sql
stable
security definer
set search_path = ''
as $$
  with o as (
    select ord.id, ord.delivered_at, m.return_days
    from public.orders ord
    join public.markets m on m.id = ord.market_id
    where ord.id = p_order_id and ord.status = 'placed' and ord.delivered_at <= now()
  ),
  span as (
    -- each product's window: its category's when ordered, else the store's
    select oi.product_id, make_interval(days => max(coalesce(oi.return_days, o.return_days))) as span
    from o
    join public.order_items oi on oi.order_id = o.id
    group by oi.product_id
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
    where r.resolution = 'refund' and r.status in ('requested', 'received') and r.created_at > o.delivered_at + s.span
    group by ri.product_id
  )
  select x.line_no, x.product_id, x.left_qty,
         greatest(o.delivered_at, rep.last_at) + s.span,
         greatest(o.delivered_at + s.span, rep.closed_at),
         (case
            when now() <= o.delivered_at + s.span then x.left_qty
            else greatest(least(x.left_qty, coalesce(rep.open_qty, 0) - coalesce(late.qty, 0)), 0)
          end)::integer,
         -- a replacement is swapped once, inside the product's own window; after it, replacements are refund-only
         (case when now() <= o.delivered_at + s.span then x.unreplaced_qty else 0 end)::integer
  from o
  cross join private.return_counts(o.id) x
  join span s on s.product_id = x.product_id
  left join rep on rep.product_id = x.product_id
  left join late on late.product_id = x.product_id
$$;

revoke execute on function private.return_windows(text) from public, anon, authenticated;
