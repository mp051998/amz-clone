/*
 * A department's own filters in search, as on amazon.in ("Storage" and "RAM" in Mobiles,
 * "Material" in Home & Kitchen, "Skin type" in Beauty).
 *
 * - search_catalog() returns `attributes`, read from the product details (`products.details`,
 *   the "Product information" table): in a department, the labels that most of the scope's
 *   products state (half of them or more, at least three), with two to ten distinct values of up
 *   to 40 characters shared among them (half as many again products as values, so not a colour
 *   per product), the four stated most often. Brand and Model are left out (Brand has its
 *   own filter). Values are counted over the query+department scope like the other facets, each
 *   variant group once.
 * - It takes `p_attrs`, {label: [values]}: a product matches when, for each label, one of its
 *   details has that label and one of the values. Anything that isn't an object is ignored.
 */

-- Another argument changes the signature, so the old function is dropped first (PostgREST
-- would otherwise see two candidates for the same named call).
drop function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer, integer, integer, boolean, integer, text[], text[], boolean, boolean, text);

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
  p_sizes      text[] default null,
  p_climate    boolean default false,
  p_small_business boolean default false,
  p_condition  text default null,
  p_attrs      jsonb default null
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
  v_climate boolean := coalesce(p_climate, false);
  v_small boolean := coalesce(p_small_business, false);
  v_condition text := case when p_condition in ('new', 'renewed', 'used') then p_condition end;
  -- {label: [values]}: anything else is ignored
  v_attrs jsonb := case when jsonb_typeof(p_attrs) = 'object' and p_attrs <> '{}'::jsonb then p_attrs end;
  v_total integer;
  v_groups integer;
  v_unavailable integer;
  v_page  integer;
  v_result jsonb;
begin
  with scope as (
    select cp.*, k.as_new, k.as_renewed, k.as_used,
      case when jsonb_typeof(p.details) = 'array' then p.details else '[]'::jsonb end as details
    from public.catalog_products cp
    join public.products p on p.id = cp.id
    -- the ways to buy it: new (itself, or another seller's new offer), renewed or used
    cross join lateral (
      select
        cp.stock > 0 or coalesce(bool_or(o.condition = 'new'), false) as as_new,
        coalesce(bool_or(o.condition = 'renewed'), false) as as_renewed,
        coalesce(bool_or(o.condition like 'used%'), false) as as_used
      from public.products o
      where o.offer_of = cp.id and o.archived_at is null and o.stock > 0
    ) k
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
      and (not v_climate or cardinality(s.climate) > 0)
      and (not v_small or s.small_business)
      and (v_condition is null
           or (v_condition = 'new' and s.as_new)
           or (v_condition = 'renewed' and s.as_renewed)
           or (v_condition = 'used' and s.as_used))
      -- each label picked: any of its values (labels together: all of them)
      and (v_attrs is null or not exists (
        select 1 from jsonb_each(v_attrs) a(label, vals)
        where not exists (
          select 1 from jsonb_array_elements(s.details) d
          where d->>0 = a.label
            and d->>1 in (select jsonb_array_elements_text(case when jsonb_typeof(a.vals) = 'array' then a.vals else '[]'::jsonb end)))))
  )
  select
    count(*) filter (where f.keep),
    count(distinct f.grp) filter (where f.keep),
    (select count(*) from (select g.grp from filtered g group by g.grp having not bool_or(g.stock > 0)) none_left)
  into v_total, v_groups, v_unavailable
  from filtered f;

  v_page := least(greatest(coalesce(p_page, 1), 1), greatest(1, ceil(v_total::numeric / v_size)::integer));

  with scope as (
    select cp.*, k.as_new, k.as_renewed, k.as_used,
      case when jsonb_typeof(p.details) = 'array' then p.details else '[]'::jsonb end as details
    from public.catalog_products cp
    join public.products p on p.id = cp.id
    -- the ways to buy it: new (itself, or another seller's new offer), renewed or used
    cross join lateral (
      select
        cp.stock > 0 or coalesce(bool_or(o.condition = 'new'), false) as as_new,
        coalesce(bool_or(o.condition = 'renewed'), false) as as_renewed,
        coalesce(bool_or(o.condition like 'used%'), false) as as_used
      from public.products o
      where o.offer_of = cp.id and o.archived_at is null and o.stock > 0
    ) k
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
  -- the department's own filters, as amazon.in's "Storage", "Material" or "Skin type": the
  -- details most of its products state (Brand and Model aside), each with a few short values
  attr_rows as (
    select d->>0 as label, d->>1 as value, coalesce(s.variant_group, s.id) as grp
    from scope s
    cross join lateral jsonb_array_elements(s.details) d
    where p_dept is not null
      and d->>0 not in ('Brand', 'Model name', 'Model')
      and length(d->>1) between 1 and 40
      and d->>0 !~ '[:|;]' and d->>1 !~ '[|;]'
  ),
  attr_labels as (
    select a.label, count(distinct a.grp) as covered
    from attr_rows a
    group by a.label
    having count(distinct a.value) between 2 and 10
       -- a filter worth having: values shared, not one per product (as colours mostly are)
       and count(distinct a.grp) >= 1.5 * count(distinct a.value)
       and count(distinct a.grp) >= 3
       and count(distinct a.grp) * 2 >= (select count(distinct coalesce(s.variant_group, s.id)) from scope s)
    order by count(distinct a.grp) desc, a.label
    limit 4
  ),
  attr_facets as (
    select a.label, a.value as name, count(distinct a.grp)::integer as count
    from attr_rows a
    join attr_labels l on l.label = a.label
    group by a.label, a.value
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
      and (not v_climate or cardinality(s.climate) > 0)
      and (not v_small or s.small_business)
      and (v_condition is null
           or (v_condition = 'new' and s.as_new)
           or (v_condition = 'renewed' and s.as_renewed)
           or (v_condition = 'used' and s.as_used))
      -- each label picked: any of its values (labels together: all of them)
      and (v_attrs is null or not exists (
        select 1 from jsonb_each(v_attrs) a(label, vals)
        where not exists (
          select 1 from jsonb_array_elements(s.details) d
          where d->>0 = a.label
            and d->>1 in (select jsonb_array_elements_text(case when jsonb_typeof(a.vals) = 'array' then a.vals else '[]'::jsonb end)))))
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
    -- how many of the scope are Climate Pledge Friendly, each variant group once
    'climate', (select count(distinct coalesce(s.variant_group, s.id))::integer from scope s where cardinality(s.climate) > 0),
    -- and how many are from small businesses
    'small_business', (select count(distinct coalesce(s.variant_group, s.id))::integer from scope s where s.small_business),
    -- and how many can be bought new, renewed or used
    'conditions', (
      select jsonb_build_object(
        'new', count(distinct coalesce(s.variant_group, s.id)) filter (where s.as_new),
        'renewed', count(distinct coalesce(s.variant_group, s.id)) filter (where s.as_renewed),
        'used', count(distinct coalesce(s.variant_group, s.id)) filter (where s.as_used))
      from scope s),
    -- the department's own filters, the most stated first: [{label, values: [{name, count}]}]
    'attributes', coalesce((
      select jsonb_agg(jsonb_build_object('label', l.label, 'values', (
          select jsonb_agg(jsonb_build_object('name', f.name, 'count', f.count) order by f.count desc, f.name)
          from attr_facets f where f.label = l.label)) order by l.covered desc, l.label)
      from attr_labels l), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) - 'ord' - 'as_new' - 'as_renewed' - 'as_used' - 'details' order by r.ord)
      from ranked r
      where r.ord > (v_page - 1) * v_size and r.ord <= v_page * v_size), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;

revoke execute on function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer, integer, integer, boolean, integer, text[], text[], boolean, boolean, text, jsonb) from public;
grant execute on function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer, integer, integer, boolean, integer, text[], text[], boolean, boolean, text, jsonb) to anon, authenticated, service_role;
