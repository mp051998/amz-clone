-- "Gift Ideas", as on Amazon: the products shoppers give most. A gift is an item of an order placed
-- as a gift, or an item bought off someone's shared list, in the last 30 days; each giver counts
-- once per product. Cancelled orders and items don't count. Orders and lists are private, so only
-- the ranking comes out: product ids, most given first (more reviews, then catalog order, break ties).
create function public.gift_ideas(p_market text, p_category text default null, p_limit integer default 40)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(g.product_id order by g.givers desc, g.review_count desc, g.position, g.product_id), '{}')
  from (
    select p.id as product_id, count(distinct given.user_id) as givers, max(p.review_count) as review_count, min(p.position) as position
    from (
      select o.user_id, oi.product_id
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.market_id = p_market and o.status = 'placed' and o.gift and o.placed_at > now() - interval '30 days'
      union all
      select g.user_id, g.product_id
      from public.collection_gifts g
      join public.collections c on c.id = g.collection_id
      where c.market_id = p_market and g.created_at > now() - interval '30 days'
    ) given
    join public.catalog_products p on p.id = given.product_id
    where p.market_id = p_market
      and (p_category is null or p.category_slug = p_category)
    group by p.id
    order by givers desc, review_count desc, position, p.id
    limit least(greatest(coalesce(p_limit, 40), 1), 100)
  ) g
$$;

revoke execute on function public.gift_ideas(text, text, integer) from public;
grant execute on function public.gift_ideas(text, text, integer) to anon, authenticated, service_role;
