/*
 * "Frequently bought together" for a product page: the products most often in
 * the same placed order, most shoppers first. Order items are private, so this
 * runs as the owner and returns only product ids and a count, and only for
 * pairs bought by at least two different shoppers, so no single shopper's
 * basket shows through. Products on sale in the same store only (the view
 * leaves archived ones out), in stock, and not another option of the same
 * variant group.
 */
create function public.bought_together(p_product_id text, p_limit integer default 4)
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
  pairs as (
    select other.product_id as id, count(distinct o.user_id) as shoppers
    from base b
    join public.order_items mine on mine.product_id = b.id
    join public.orders o on o.id = mine.order_id and o.status = 'placed' and o.market_id = b.market_id
    join public.order_items other on other.order_id = o.id and other.product_id <> b.id
    group by other.product_id
    having count(distinct o.user_id) >= 2
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'shoppers', x.shoppers) order by x.shoppers desc, x.review_count desc, x.id), '[]'::jsonb)
  from (
    select pr.id, pr.shoppers, cp.review_count
    from pairs pr
    join base b on true
    join public.catalog_products cp on cp.id = pr.id and cp.market_id = b.market_id
    where cp.stock > 0
      and (b.variant_group is null or cp.variant_group is distinct from b.variant_group)
    order by pr.shoppers desc, cp.review_count desc, pr.id
    limit least(greatest(coalesce(p_limit, 4), 1), 12)
  ) x
$$;

revoke execute on function public.bought_together(text, integer) from public;
grant execute on function public.bought_together(text, integer) to anon, authenticated, service_role;
