/*
 * "Customers who bought this item also bought" for a product page: what the shoppers who bought a
 * product bought in any of their placed orders in the same store, most of those shoppers first.
 * Unlike bought_together(), the other product needn't be in the same order. Orders are private,
 * so this runs as the owner and returns only product ids and a count, and only for products at
 * least two of those shoppers bought, so no single shopper's purchases show through. Products on
 * sale in the same store only (the view leaves archived ones out), in stock, and not another
 * option of the same variant group.
 */
create function public.also_bought(p_product_id text, p_limit integer default 8)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select cp.id, cp.market_id, cp.variant_group
    from public.catalog_products cp
    where cp.id = p_product_id
  ),
  buyers as (
    select distinct o.user_id
    from base b
    join public.order_items mine on mine.product_id = b.id
    join public.orders o on o.id = mine.order_id and o.status = 'placed' and o.market_id = b.market_id
    where o.user_id is not null
  ),
  bought as (
    select oi.product_id as id, count(distinct o.user_id) as shoppers
    from base b
    join buyers u on true
    join public.orders o on o.user_id = u.user_id and o.status = 'placed' and o.market_id = b.market_id
    join public.order_items oi on oi.order_id = o.id and oi.product_id <> b.id
    group by oi.product_id
    having count(distinct o.user_id) >= 2
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'shoppers', x.shoppers) order by x.shoppers desc, x.review_count desc, x.id), '[]'::jsonb)
  from (
    select bt.id, bt.shoppers, cp.review_count
    from bought bt
    join base b on true
    join public.catalog_products cp on cp.id = bt.id and cp.market_id = b.market_id
    where cp.stock > 0
      and (b.variant_group is null or cp.variant_group is distinct from b.variant_group)
    order by bt.shoppers desc, cp.review_count desc, bt.id
    limit least(greatest(coalesce(p_limit, 8), 1), 12)
  ) x
$$;

revoke execute on function public.also_bought(text, integer) from public;
grant execute on function public.also_bought(text, integer) to anon, authenticated, service_role;
