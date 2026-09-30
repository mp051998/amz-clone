-- ===========================================================================
-- Fold variants in listings
-- ===========================================================================
-- A product's variant group (products.variant_group, _axis, _label) joins the
-- catalog views, so listings can show one card per group: the app keeps the
-- best-placed option of each group and shows the others as swatches.
-- search_catalog() still returns every matching product (its pages feed the
-- ranked search), and now also counts them as groups: `groups` beside
-- `total`, and brand facets count a group once.

-- New columns go last, so the views can be replaced in place.
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
  p.variant_label
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
  variant_group, variant_axis, variant_label
from public.catalog_products_all
where archived_at is null;

/*
 * As before, plus `groups`: the matching products counted once per variant
 * group. Brand facets count groups too, so "Sony (3)" means three cards.
 */
create or replace function public.search_catalog(
  p_market     text,
  p_q          text default null,
  p_dept       text default null,
  p_brands     text[] default null,
  p_min_rating numeric default null,
  p_deal       boolean default false,
  p_sort       text default 'featured',
  p_page       integer default 1,
  p_page_size  integer default 16
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_query tsquery := public.to_prefix_tsquery(p_q);
  v_size  integer := least(greatest(coalesce(p_page_size, 16), 1), 60);
  v_sort  text := case when p_sort in ('price-asc', 'price-desc', 'review', 'newest') then p_sort else 'featured' end;
  v_total integer;
  v_groups integer;
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
    select s.* from scope s
    where (p_brands is null or cardinality(p_brands) = 0 or s.brand = any (p_brands))
      and (p_min_rating is null or s.rating >= p_min_rating)
      and (not coalesce(p_deal, false) or s.deal)
  )
  select count(*), count(distinct coalesce(f.variant_group, f.id)) into v_total, v_groups from filtered f;

  v_page := least(greatest(coalesce(p_page, 1), 1), greatest(1, ceil(v_total::numeric / v_size)::integer));

  with scope as (
    select cp.*
    from public.catalog_products cp
    join public.products p on p.id = cp.id
    where cp.market_id = p_market
      and (p_dept is null or cp.category_slug = p_dept)
      and (v_query is null or p.search_doc @@ v_query)
  ),
  brand_facets as (
    select s.brand as name, count(distinct coalesce(s.variant_group, s.id))::integer as count
    from scope s
    where s.brand is not null
    group by s.brand
  ),
  ranked as (
    select s.*, row_number() over (
      order by
        case when v_sort = 'price-asc' then s.price_minor end asc,
        case when v_sort = 'price-desc' then s.price_minor end desc,
        case when v_sort = 'review' then s.rating end desc,
        case when v_sort = 'review' then s.review_count end desc,
        case when v_sort = 'newest' then s.position end desc,
        case when v_sort = 'featured' then s.badge_rank end asc,
        case when v_sort = 'featured' then s.review_count end desc,
        s.position asc
    ) as ord
    from scope s
    where (p_brands is null or cardinality(p_brands) = 0 or s.brand = any (p_brands))
      and (p_min_rating is null or s.rating >= p_min_rating)
      and (not coalesce(p_deal, false) or s.deal)
  )
  select jsonb_build_object(
    'total', v_total,
    'groups', v_groups,
    'page', v_page,
    'page_size', v_size,
    'page_count', greatest(1, ceil(v_total::numeric / v_size)::integer),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('name', b.name, 'count', b.count) order by b.count desc, b.name)
      from brand_facets b), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) - 'ord' order by r.ord)
      from ranked r
      where r.ord > (v_page - 1) * v_size and r.ord <= v_page * v_size), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;
