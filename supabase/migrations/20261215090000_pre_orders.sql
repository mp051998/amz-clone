/*
 * Pre-orders, as on Amazon: a product with a release date still to come (products.release_at)
 * can be ordered before it's out, and ships when it's released. Its page says when, and its
 * button reads "Pre-order now". An order holding such an item keeps the latest release among its
 * items (orders.release_at, set as the items go in), and its schedule runs from that release
 * rather than from when it was placed, so the shopper can change or cancel it right up to then.
 * If an admin moves a release, the orders waiting on it move with it. Once the date passes the
 * product is an ordinary one again.
 */

alter table public.products
  add column release_at timestamptz;

-- admins write it like the other product fields (column grants, admin.sql)
grant insert (release_at), update (release_at) on public.products to authenticated;

alter table public.orders
  add column release_at timestamptz;

-- The catalog views (as in 20261210090000_quantity_discounts) gain the release date, last.

create or replace view public.catalog_products_all
with (security_invoker = true)
as
select
  p.id,
  p.market_id,
  m.currency,
  p.category_slug,
  c.name as category_name,
  p.title,
  p.brand,
  p.image,
  p.price_minor,
  p.list_minor,
  p.deal_pct,
  p.deal,
  p.badge,
  p.bought_past_month,
  p.seller,
  p.ships_from,
  p.bullets,
  p.stock,
  p.position,
  coalesce(round(r.rating_sum / nullif(r.rating_count, 0), 1), 0)::numeric(2, 1) as rating,
  coalesce(r.rating_count, 0) as review_count,
  case p.badge
    when 'Amazon''s Choice' then 0
    when 'Best Seller' then 1
    when 'Overall Pick' then 2
    else 3
  end as badge_rank,
  p.archived_at,
  p.variant_group,
  p.variant_axis,
  p.variant_label,
  p.max_per_customer,
  p.sizes,
  p.unit_qty,
  p.unit_kind,
  p.qty_discount_pct,
  p.qty_discount_min,
  p.release_at
from public.products p
join public.markets m on m.id = p.market_id
join public.categories c on c.slug = p.category_slug
left join public.product_ratings r on r.product_id = p.id;

create or replace view public.catalog_products
with (security_invoker = true)
as
select
  id, market_id, currency, category_slug, category_name, title, brand, image,
  price_minor, list_minor, deal_pct, deal, badge, bought_past_month, seller,
  ships_from, bullets, stock, position, rating, review_count, badge_rank,
  variant_group, variant_axis, variant_label, max_per_customer, sizes,
  unit_qty, unit_kind, qty_discount_pct, qty_discount_min, release_at
from public.catalog_products_all
where archived_at is null;

-- ---------------------------------------------------------------------------
-- The schedule filled on placement (as in 20261211090000_delivery_day) starts at the order's
-- release when it has one, and is worked out again when the release changes.
-- ---------------------------------------------------------------------------
create or replace function public.orders_fill_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz   text;
  v_from timestamptz;
  v_d    record;
begin
  if new.status = 'placed' and new.placed_at is not null and new.shipped_at is null then
    select m.time_zone into v_tz from public.markets m where m.id = new.market_id;
    v_tz := coalesce(v_tz, 'UTC');
    v_from := greatest(new.placed_at, coalesce(new.release_at, new.placed_at));
    if new.ship_speed = 'fast' then
      new.shipped_at := v_from + interval '3 hours';
      select * into v_d from private.fast_delivery_after(new.shipped_at, v_tz);
    elsif new.ship_speed = 'day' then
      select * into v_d from private.delivery_day_after(v_from, new.delivery_day, v_tz);
      new.shipped_at := v_d.shipped;
    else
      new.shipped_at := v_from + interval '10 hours';
      select * into v_d from private.delivery_after(new.shipped_at, v_tz);
    end if;
    new.out_for_delivery_at := v_d.out_for_delivery;
    new.delivered_at := v_d.delivered;
  end if;
  return new;
end
$$;

drop trigger orders_fill_schedule on public.orders;
create trigger orders_fill_schedule
  before insert or update of status, placed_at, release_at on public.orders
  for each row execute function public.orders_fill_schedule();

-- An item that isn't out yet holds its order until it is: the order takes the latest release
-- among its items, and a placed one has its schedule worked out again from then.
create function private.order_items_hold_for_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release timestamptz;
begin
  select p.release_at into v_release from public.products p where p.id = new.product_id;
  if v_release > now() then
    update public.orders o
       set release_at = v_release, shipped_at = null, out_for_delivery_at = null, delivered_at = null
     where o.id = new.order_id and o.status in ('awaiting_payment', 'placed')
       and (o.shipped_at is null or o.shipped_at > now())
       and (o.release_at is null or o.release_at < v_release);
  end if;
  return null;
end
$$;

revoke execute on function private.order_items_hold_for_release() from public, anon, authenticated;

create trigger order_items_hold_for_release
  after insert on public.order_items
  for each row execute function private.order_items_hold_for_release();

-- A release an admin moves (or brings forward to now) moves the pre-orders still waiting on it:
-- each takes the latest release left among its items, or now when none is still to come.
create function private.products_move_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders o
     set release_at = r.release, shipped_at = null, out_for_delivery_at = null, delivered_at = null
    from (
      select oi.order_id, greatest(coalesce(max(p.release_at), now()), now()) as release
        from public.order_items oi
        join public.products p on p.id = oi.product_id
       where oi.order_id in (select x.order_id from public.order_items x where x.product_id = new.id)
       group by oi.order_id
    ) r
   where o.id = r.order_id
     and o.release_at is not null
     and o.status in ('awaiting_payment', 'placed')
     and (o.shipped_at is null or o.shipped_at > now())
     and o.release_at is distinct from r.release;
  return null;
end
$$;

revoke execute on function private.products_move_release() from public, anon, authenticated;

create trigger products_move_release
  after update of release_at on public.products
  for each row when (old.release_at is distinct from new.release_at)
  execute function private.products_move_release();

-- Cancelling the item an order waits for (cancel_order_items deletes it) lets the rest go
-- sooner: the order takes the latest release left among its items, or now when none is to come.
create function private.order_items_release_after_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders o
     set release_at = r.release, shipped_at = null, out_for_delivery_at = null, delivered_at = null
    from (
      select greatest(coalesce(max(p.release_at), now()), now()) as release
        from public.order_items oi
        join public.products p on p.id = oi.product_id
       where oi.order_id = old.order_id
    ) r
   where o.id = old.order_id
     and o.release_at > now()
     and o.status in ('awaiting_payment', 'placed')
     and r.release < o.release_at;
  return null;
end
$$;

revoke execute on function private.order_items_release_after_cancel() from public, anon, authenticated;

create trigger order_items_release_after_cancel
  after delete on public.order_items
  for each row execute function private.order_items_release_after_cancel();
