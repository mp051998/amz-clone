-- A seller's page, as on Amazon's seller profile: how shoppers rated them over the last 30 and
-- 90 days, 12 months and in all (positive = 4–5 stars, neutral = 3, negative = 1–2), the
-- 12-month star breakdown, and the latest comments. Public, and never says who left a rating.
-- Null when the seller has nothing listed in the store and no feedback there.

create function public.seller_profile(p_market text, p_seller text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select rating, arrived_on_time, as_described, comment, created_at
    from public.seller_feedback
    where market_id = p_market and seller = p_seller
  ),
  periods as (
    select d.label, d.ord,
           count(f.rating)::integer as ratings,
           (count(*) filter (where f.rating >= 4))::integer as positive,
           (count(*) filter (where f.rating = 3))::integer as neutral,
           (count(*) filter (where f.rating <= 2))::integer as negative
    from (values ('30d', 1, interval '30 days'), ('90d', 2, interval '90 days'), ('12m', 3, interval '12 months'), ('all', 4, null::interval))
           as d (label, ord, span)
    left join f on d.span is null or f.created_at > now() - d.span
    group by d.label, d.ord
  )
  select case
    when not exists (select 1 from f)
     and not exists (select 1 from public.catalog_products p where p.market_id = p_market and p.seller = p_seller)
    then null
    else jsonb_build_object(
      'seller', p_seller,
      'periods', (select jsonb_agg(jsonb_build_object('period', label, 'ratings', ratings, 'positive', positive, 'neutral', neutral, 'negative', negative) order by ord) from periods),
      'stars', (
        select jsonb_object_agg(s.n, (select count(*) from f where f.rating = s.n and f.created_at > now() - interval '12 months'))
        from generate_series(1, 5) as s (n)
      ),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object('rating', r.rating, 'arrivedOnTime', r.arrived_on_time, 'asDescribed', r.as_described, 'comment', r.comment, 'createdAt', r.created_at) order by r.created_at desc)
        from (select * from f where f.comment is not null order by f.created_at desc limit 10) r
      ), '[]'::jsonb)
    )
  end
$$;

revoke execute on function public.seller_profile(text, text) from public;
grant execute on function public.seller_profile(text, text) to anon, authenticated, service_role;
