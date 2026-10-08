/*
 * Small Business, as on Amazon: products from brands the store marks as small businesses carry the
 * badge, show the brand's story on their pages, and can be filtered for in search.
 *
 * - small_businesses: the store's small-business brands (a brand as products name it), each with a
 *   line about what it makes, shown on its products and brand store. Anyone reads them; admins add, edit and
 *   remove them. The store's own designation, a demo's.
 * - The catalog views say whether a product is from one (`small_business`); another seller's offer
 *   is as its product is.
 * - search_catalog() takes `p_small_business` (keep only theirs) and returns `small_business`, how
 *   many of the query+department scope are, counted like the other facets.
 */

create table public.small_businesses (
  market_id  text not null references public.markets (id),
  brand      text not null check (char_length(brand) between 1 and 120 and brand = btrim(brand)),
  story      text not null check (char_length(story) between 1 and 600),
  created_at timestamptz not null default now(),
  primary key (market_id, brand)
);

alter table public.small_businesses enable row level security;

create policy "anyone reads small businesses" on public.small_businesses
  for select to anon, authenticated using (true);
create policy "admins add small businesses" on public.small_businesses
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins edit small businesses" on public.small_businesses
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins remove small businesses" on public.small_businesses
  for delete to authenticated using ((select public.is_admin()));

revoke all on public.small_businesses from anon, authenticated;
grant select on public.small_businesses to anon, authenticated;
grant insert (market_id, brand, story), update (story), delete on public.small_businesses to authenticated;

-- the demo stores' small businesses (brands the seeded catalog sells)
insert into public.small_businesses (market_id, brand, story) values
  ('US', 'Flycatcher', 'Build-and-play kits and activity toys for kids.'),
  ('US', 'Masterbee', 'Hands-on learning toys for young children.'),
  ('US', 'Lifepro', 'Recovery and home-workout gear.'),
  ('US', 'Astercook', 'Pans, knives and cookware for everyday home kitchens.'),
  ('US', 'Tower 28', 'Makeup and skin care.'),
  ('IN', 'Smartivity', 'STEM building kits and learning toys.'),
  ('IN', 'Storio', 'Learning toys and kids’ essentials.'),
  ('IN', 'Wiselife', 'Yoga and fitness accessories for practice at home.'),
  ('IN', 'Burnlab', 'Workout gear for home and gym training.'),
  ('IN', 'Muuchstac', 'Face care and grooming for men.'),
  ('IN', 'Eitheo', 'Puzzles and activity sets for young children.')
on conflict do nothing;

-- the catalog views show it (a new column goes last)
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
  p.release_at,
  p.offer_of,
  p.condition,
  p.condition_note,
  -- what can be subscribed to: a product limited per customer can't be
  p.subscribe_save and p.max_per_customer is null as subscribe_save,
  -- another seller's offer is certified as its product is
  coalesce(o.climate, p.climate) as climate,
  -- a small business's products, and other sellers' offers on them
  exists (
    select 1 from public.small_businesses sb
    where sb.market_id = p.market_id and sb.brand = coalesce(o.brand, p.brand)
  ) as small_business
from public.products p
join public.markets m on m.id = p.market_id
join public.categories c on c.slug = p.category_slug
-- an offer is rated as its product: reviews are the product's, whoever sold it
left join public.product_ratings r on r.product_id = coalesce(p.offer_of, p.id)
left join public.products o on o.id = p.offer_of;

create or replace view public.catalog_products
with (security_invoker = true)
as
select
  id, market_id, currency, category_slug, category_name, title, brand, image,
  price_minor, list_minor, deal_pct, deal, badge, bought_past_month, seller,
  ships_from, bullets, stock, position, rating, review_count, badge_rank,
  variant_group, variant_axis, variant_label, max_per_customer, sizes,
  unit_qty, unit_kind, qty_discount_pct, qty_discount_min, release_at, subscribe_save, climate, small_business
from public.catalog_products_all
where archived_at is null and offer_of is null;

-- Another argument changes the signature, so the old function is dropped first (PostgREST
-- would otherwise see two candidates for the same named call).
drop function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer, integer, integer, boolean, integer, text[], text[], boolean);

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
  p_small_business boolean default false
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
      and (not v_climate or cardinality(s.climate) > 0)
      and (not v_small or s.small_business)
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
      and (not v_climate or cardinality(s.climate) > 0)
      and (not v_small or s.small_business)
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
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) - 'ord' order by r.ord)
      from ranked r
      where r.ord > (v_page - 1) * v_size and r.ord <= v_page * v_size), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;

revoke execute on function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer, integer, integer, boolean, integer, text[], text[], boolean, boolean) from public;
grant execute on function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer, integer, integer, boolean, integer, text[], text[], boolean, boolean) to anon, authenticated, service_role;
