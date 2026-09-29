-- Catalog: markets (the commercial rules per store), categories, products with
-- stock, rating aggregates, the public catalog view and the search RPC.

-- ---------------------------------------------------------------------------
-- markets — one row per storefront. Pricing rules live here so every total the
-- app shows is computed by the database, not the client.
-- ---------------------------------------------------------------------------
create table public.markets (
  id                        text primary key check (id in ('US', 'IN')),
  currency                  text not null check (currency in ('USD', 'INR')),
  tax_rate_bps              integer not null default 0 check (tax_rate_bps between 0 and 10000),
  tax_inclusive             boolean not null,
  free_ship_threshold_minor integer not null check (free_ship_threshold_minor >= 0),
  ship_fee_minor            integer not null check (ship_fee_minor >= 0),
  max_line_qty              integer not null default 30 check (max_line_qty > 0),
  payment_methods           text[] not null
);

insert into public.markets
  (id, currency, tax_rate_bps, tax_inclusive, free_ship_threshold_minor, ship_fee_minor, max_line_qty, payment_methods)
values
  ('US', 'USD', 800, false, 3500, 599, 30, array['card', 'giftcard']),
  ('IN', 'INR', 0, true, 49900, 4000, 30, array['upi', 'card', 'netbanking', 'cod', 'emi', 'amazonpay']);

-- ---------------------------------------------------------------------------
-- categories + which of them each market shows (and in what order)
-- ---------------------------------------------------------------------------
create table public.categories (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 1 and 80)
);

create table public.market_categories (
  market_id     text not null references public.markets (id) on delete cascade,
  category_slug text not null references public.categories (slug) on delete cascade,
  position      integer not null,
  primary key (market_id, category_slug)
);

-- ---------------------------------------------------------------------------
-- products — each belongs to exactly one market and is priced in its currency
-- ---------------------------------------------------------------------------
create table public.products (
  id                text primary key,
  market_id         text not null references public.markets (id),
  category_slug     text not null references public.categories (slug),
  title             text not null check (char_length(title) between 1 and 300),
  brand             text,
  image             text not null,
  price_minor       integer not null check (price_minor > 0),
  list_minor        integer check (list_minor is null or list_minor > price_minor),
  deal_pct          integer check (deal_pct between 1 and 99),
  deal              boolean not null default false,
  badge             text,
  bought_past_month text,
  seller            text not null,
  ships_from        text not null,
  bullets           text[] not null default '{}',
  stock             integer not null default 0 check (stock >= 0),
  position          integer not null,
  search_doc        tsvector,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index products_market_category_idx on public.products (market_id, category_slug);
create index products_market_position_idx on public.products (market_id, position);
create index products_market_brand_idx on public.products (market_id, brand);
create index products_search_idx on public.products using gin (search_doc);

-- Full-text document: title + brand weigh most, the category name helps recall.
create function public.products_search_doc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_doc :=
    setweight(to_tsvector('simple', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.brand, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(
      (select c.name from public.categories c where c.slug = new.category_slug), '')), 'B');
  return new;
end
$$;

create trigger products_search_doc
  before insert or update of title, brand, category_slug on public.products
  for each row execute function public.products_search_doc();

create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- product_ratings — running aggregate per product. Seeded with each product's
-- historical rating volume; every real customer review adjusts it via trigger.
-- ---------------------------------------------------------------------------
create table public.product_ratings (
  product_id   text primary key references public.products (id) on delete cascade,
  rating_count integer not null default 0 check (rating_count >= 0),
  rating_sum   numeric(14, 1) not null default 0 check (rating_sum >= 0),
  star_1       integer not null default 0 check (star_1 >= 0),
  star_2       integer not null default 0 check (star_2 >= 0),
  star_3       integer not null default 0 check (star_3 >= 0),
  star_4       integer not null default 0 check (star_4 >= 0),
  star_5       integer not null default 0 check (star_5 >= 0)
);

-- ---------------------------------------------------------------------------
-- catalog_products — the read model every listing renders from
-- ---------------------------------------------------------------------------
create view public.catalog_products
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
  end as badge_rank
from public.products p
join public.markets m on m.id = p.market_id
join public.categories c on c.slug = p.category_slug
left join public.product_ratings r on r.product_id = p.id;

-- ---------------------------------------------------------------------------
-- Row-level security: the catalog is world-readable and read-only over the API.
-- ---------------------------------------------------------------------------
alter table public.markets enable row level security;
alter table public.categories enable row level security;
alter table public.market_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_ratings enable row level security;

create policy "markets are public" on public.markets for select to anon, authenticated using (true);
create policy "categories are public" on public.categories for select to anon, authenticated using (true);
create policy "market categories are public" on public.market_categories for select to anon, authenticated using (true);
create policy "products are public" on public.products for select to anon, authenticated using (true);
create policy "ratings are public" on public.product_ratings for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on
  public.markets, public.categories, public.market_categories, public.products, public.product_ratings
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

-- "wireless head" -> 'wireless':* & 'head':*  (every term must prefix-match)
create function public.to_prefix_tsquery(p_text text)
returns tsquery
language sql
immutable
set search_path = ''
as $$
  select to_tsquery('simple', string_agg(quote_literal(t) || ':*', ' & '))
  from regexp_split_to_table(lower(coalesce(p_text, '')), '[^[:alnum:]]+') as t
  where t <> ''
$$;

/**
 * One round trip for the search page: the page of items, the total after
 * filters, and brand facets for the query+department scope (computed before the
 * brand/rating/deal filters so the facet list stays stable while filtering).
 */
create function public.search_catalog(
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
  select count(*) into v_total from filtered;

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
    select s.brand as name, count(*)::integer as count
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

revoke execute on function public.to_prefix_tsquery(text) from public;
revoke execute on function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer) from public;
grant execute on function public.to_prefix_tsquery(text) to anon, authenticated, service_role;
grant execute on function public.search_catalog(text, text, text, text[], numeric, boolean, text, integer, integer) to anon, authenticated, service_role;
