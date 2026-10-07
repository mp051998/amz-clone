-- Purchase limits, as Amazon's "Limit 2 per customer": a product can cap how many units one
-- shopper buys in its store, across all their orders. Units in orders that weren't cancelled
-- count (items cancelled before shipping leave their order, so they don't); returned units
-- still count, as they were bought.
--
-- The limit is enforced where order items are written, so place_order() needs no change: a
-- line that would take the shopper past the limit fails the whole order with
-- purchase_limit (detail: the product id). place_order() locks each product row before it
-- writes the items, so two checkouts of the same product can't both slip under it.

alter table public.products
  add column max_per_customer smallint check (max_per_customer between 1 and 99);

-- admins write it like the other product fields (column grants, admin.sql)
grant insert (max_per_customer), update (max_per_customer) on public.products to authenticated;

-- The catalog views (as in 20261007090000_fold_variants) gain the limit, last.
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
  p.max_per_customer
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
  variant_group, variant_axis, variant_label, max_per_customer
from public.catalog_products_all
where archived_at is null;

-- ---------------------------------------------------------------------------
-- How many units of a product a shopper has bought: what's in their orders that weren't
-- cancelled, leaving one order out (the one being written).
-- ---------------------------------------------------------------------------
create function private.units_bought(p_uid uuid, p_product_id text, p_except_order text default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(oi.qty), 0)::integer
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.user_id = p_uid
    and oi.product_id = p_product_id
    and o.status <> 'cancelled'
    and o.id is distinct from p_except_order
$$;

revoke execute on function private.units_bought(uuid, text, text) from public, anon, authenticated;

create function private.order_items_purchase_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit smallint;
  v_uid   uuid;
begin
  select p.max_per_customer into v_limit from public.products p where p.id = new.product_id;
  if v_limit is null then
    return new;
  end if;
  select o.user_id into v_uid from public.orders o where o.id = new.order_id;
  if v_uid is not null and private.units_bought(v_uid, new.product_id, new.order_id) + new.qty > v_limit then
    raise exception 'purchase_limit' using errcode = 'P0001', detail = new.product_id;
  end if;
  return new;
end
$$;

revoke execute on function private.order_items_purchase_limit() from public, anon, authenticated;

create trigger order_items_purchase_limit
  before insert on public.order_items
  for each row execute function private.order_items_purchase_limit();

-- ---------------------------------------------------------------------------
-- purchase_allowance: for the signed-in shopper, each of these products (in this store) that
-- has a limit, with how many they've bought.
-- ---------------------------------------------------------------------------
create function public.purchase_allowance(p_market text, p_product_ids text[])
returns table (product_id text, max_per_customer smallint, bought integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return query
    select p.id, p.max_per_customer, private.units_bought(v_uid, p.id)
    from public.products p
    where p.market_id = p_market
      and p.id = any ((coalesce(p_product_ids, '{}'::text[]))[1:200])
      and p.max_per_customer is not null
    order by p.id;
end
$$;

revoke execute on function public.purchase_allowance(text, text[]) from public, anon;
grant execute on function public.purchase_allowance(text, text[]) to authenticated, service_role;

-- The steepest deals are limited to 3 per customer, as Amazon limits its deals (stores whose
-- catalogue isn't loaded yet have none to limit).
update public.products set max_per_customer = 3 where deal and deal_pct >= 40 and max_per_customer is null;
