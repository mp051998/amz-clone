-- A "Size" filter, as on Amazon's search results for clothes and shoes: search_catalog() takes
-- `p_sizes` (keep products that come in any of them) and returns `sizes`, size facets over the
-- query+department scope with each variant group counted once, built like the brand and seller
-- facets (before the other filters; in-stock products only, unless out of stock is included).
-- The storefront puts the facets in size-chart order.
--
-- Another argument changes the signature, so the old function is dropped first (PostgREST
-- would otherwise see two candidates for the same named call).

drop function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer, integer, integer, boolean, integer, text[]);

create function public.search_catalog(
  p_market     text,
  p_q          text default null,
  p_dept       text default null,
  p_brands     text[] default null,
  p_min_rating numeric default null,
  p_deal       boolean default false,
  p_sort       text default 'featured',
  p_page       integer default 1,
  p_page_size  integer default 16,
  p_min_price  integer default null,
  p_max_price  integer default null,
  p_in_stock   boolean default false,
  p_min_discount integer default null,
  p_sellers    text[] default null,
  p_sizes      text[] default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_query tsquery := public.to_prefix_tsquery(p_q);
  v_size  integer := least(greatest(coalesce(p_page_size, 16), 1), 60);
  v_sort  text := case when p_sort in ('price-asc', 'price-desc', 'review', 'newest', 'bestsellers') then p_sort else 'featured' end;
  v_in_stock boolean := coalesce(p_in_stock, false);
  v_total integer;
  v_groups integer;
  v_unavailable integer;
  v_page  integer;
  v_result jsonb;
begin
  with scope as (
    select cp.*
    from public.catalog_products cp
    join public.products p on p.id = cp.id
    where cp.market_id = p_market
      and (p_dept is null or cp.category_slug = p_dept)
      and (v_query is null or p.search_doc @@ v_query)
  ),
  filtered as (
    select s.*, coalesce(s.variant_group, s.id) as grp, (not v_in_stock or s.stock > 0) as keep
    from scope s
    where (p_brands is null or cardinality(p_brands) = 0 or s.brand = any (p_brands))
      and (p_min_rating is null or s.rating >= p_min_rating)
      and (not coalesce(p_deal, false) or s.deal)
      and (p_min_price is null or s.price_minor >= p_min_price)
      and (p_max_price is null or s.price_minor <= p_max_price)
      and (p_min_discount is null or (s.deal and coalesce(s.deal_pct, 0) >= p_min_discount))
      and (p_sellers is null or cardinality(p_sellers) = 0 or s.seller = any (p_sellers))
      and (p_sizes is null or cardinality(p_sizes) = 0 or s.sizes && p_sizes)
  )
  select
    count(*) filter (where f.keep),
    count(distinct f.grp) filter (where f.keep),
    (select count(*) from (select g.grp from filtered g group by g.grp having not bool_or(g.stock > 0)) none_left)
  into v_total, v_groups, v_unavailable
  from filtered f;

  v_page := least(greatest(coalesce(p_page, 1), 1), greatest(1, ceil(v_total::numeric / v_size)::integer));

  with scope as (
    select cp.*
    from public.catalog_products cp
    join public.products p on p.id = cp.id
    where cp.market_id = p_market
      and (p_dept is null or cp.category_slug = p_dept)
      and (v_query is null or p.search_doc @@ v_query)
      and (not v_in_stock or cp.stock > 0)
  ),
  brand_facets as (
    select s.brand as name, count(distinct coalesce(s.variant_group, s.id))::integer as count
    from scope s
    where s.brand is not null
    group by s.brand
  ),
  seller_facets as (
    select s.seller as name, count(distinct coalesce(s.variant_group, s.id))::integer as count
    from scope s
    where s.seller is not null
    group by s.seller
  ),
  size_facets as (
    select z.size as name, count(distinct coalesce(s.variant_group, s.id))::integer as count
    from scope s
    cross join lateral unnest(s.sizes) as z(size)
    group by z.size
  ),
  ranked as (
    select s.*, row_number() over (
      order by
        case when v_sort = 'price-asc' then s.price_minor end asc,
        case when v_sort = 'price-desc' then s.price_minor end desc,
        case when v_sort = 'review' then s.rating end desc,
        case when v_sort = 'review' then s.review_count end desc,
        case when v_sort = 'newest' then s.position end desc,
        case when v_sort = 'bestsellers' then s.review_count end desc,
        case when v_sort = 'bestsellers' then s.rating end desc,
        case when v_sort = 'featured' then s.badge_rank end asc,
        case when v_sort = 'featured' then s.review_count end desc,
        s.position asc
    ) as ord
    from scope s
    where (p_brands is null or cardinality(p_brands) = 0 or s.brand = any (p_brands))
      and (p_min_rating is null or s.rating >= p_min_rating)
      and (not coalesce(p_deal, false) or s.deal)
      and (p_min_price is null or s.price_minor >= p_min_price)
      and (p_max_price is null or s.price_minor <= p_max_price)
      and (p_min_discount is null or (s.deal and coalesce(s.deal_pct, 0) >= p_min_discount))
      and (p_sellers is null or cardinality(p_sellers) = 0 or s.seller = any (p_sellers))
      and (p_sizes is null or cardinality(p_sizes) = 0 or s.sizes && p_sizes)
  )
  select jsonb_build_object(
    'total', v_total,
    'groups', v_groups,
    'unavailable', v_unavailable,
    'page', v_page,
    'page_size', v_size,
    'page_count', greatest(1, ceil(v_total::numeric / v_size)::integer),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('name', b.name, 'count', b.count) order by b.count desc, b.name)
      from brand_facets b), '[]'::jsonb),
    'sellers', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'count', x.count) order by x.count desc, x.name)
      from seller_facets x), '[]'::jsonb),
    'sizes', coalesce((
      select jsonb_agg(jsonb_build_object('name', z.name, 'count', z.count) order by z.name)
      from size_facets z), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) - 'ord' order by r.ord)
      from ranked r
      where r.ord > (v_page - 1) * v_size and r.ord <= v_page * v_size), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;

revoke execute on function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer, integer, integer, boolean, integer, text[], text[]) from public;
grant execute on function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer, integer, integer, boolean, integer, text[], text[]) to anon, authenticated, service_role;
