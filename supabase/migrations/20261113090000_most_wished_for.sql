-- "Most Wished For", as on Amazon: the products shoppers add to their lists most. A product counts
-- each shopper once however many of their lists hold it, for saves in the last 30 days; the cart's
-- "Saved for later" isn't a wish. Lists are private, so only the ranking comes out: product ids,
-- most wished first (more reviews, then catalog order, break ties).
create function public.most_wished_for(p_market text, p_category text default null, p_limit integer default 40)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(w.product_id order by w.wishers desc, w.review_count desc, w.position, w.product_id), '{}')
  from (
    select ci.product_id, count(distinct c.user_id) as wishers, max(p.review_count) as review_count, min(p.position) as position
    from public.collection_items ci
    join public.collections c on c.id = ci.collection_id
    join public.catalog_products p on p.id = ci.product_id
    where c.market_id = p_market
      and p.market_id = p_market
      and c.kind <> 'later'
      and ci.added_at > now() - interval '30 days'
      and (p_category is null or p.category_slug = p_category)
    group by ci.product_id
    order by wishers desc, review_count desc, position, ci.product_id
    limit least(greatest(coalesce(p_limit, 40), 1), 100)
  ) w
$$;

revoke execute on function public.most_wished_for(text, text, integer) from public;
grant execute on function public.most_wished_for(text, text, integer) to anon, authenticated, service_role;
