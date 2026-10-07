-- Unit pricing, as Amazon shows beside a price: "$19.66 ($6.55 / Fl Oz)", "₹178 (₹118.67 / 100 ml)".
-- A product can say how much it holds: unit_qty of unit_kind (3 fl oz, 150 ml, 30 count). The
-- storefront works out the price per the kind's base (one ounce, 100 ml, …); nothing else
-- changes. Both are set or neither.

alter table public.products
  add column unit_qty numeric(10, 2) constraint products_unit_qty_check check (unit_qty > 0 and unit_qty <= 100000),
  add column unit_kind text constraint products_unit_kind_check check (unit_kind in ('count', 'oz', 'fl_oz', 'lb', 'g', 'kg', 'ml', 'l')),
  add constraint products_unit_check check ((unit_qty is null) = (unit_kind is null));

-- admins write them like the other product fields (column grants, admin.sql)
grant insert (unit_qty, unit_kind), update (unit_qty, unit_kind) on public.products to authenticated;

-- What the store's sized products hold (a fresh database's seed loads after this, without them,
-- so the integration tests' products stay as they were: tests give their own products a unit).
update public.products p
   set unit_qty = v.qty, unit_kind = v.kind
  from (values
    ('61TuwUQqvL', 3::numeric, 'fl_oz'),
    ('71XJ8ORYxCL', 1.86, 'oz'),
    ('71LxbmXeL', 30, 'count'),
    ('917ZRbSY9TL', 160, 'count'),
    ('815sofq0avL', 150, 'count'),
    ('71eSSNJH9fL', 4, 'count'),
    ('in-51fdXXIWFL', 100, 'ml'),
    ('in-518N3l4z1L', 150, 'ml'),
    ('in-71gqGCYkFuL', 200, 'ml'),
    ('in-61ddBs1gCaL', 236, 'ml'),
    ('in-61tvXQQDhL', 50, 'g'),
    ('in-51gQUz3N6ZL', 50, 'g'),
    ('in-51Y0eeQykEL', 80, 'g'),
    ('in-61ckTgN44WL', 50, 'g')
  ) as v (id, qty, kind)
 where p.id = v.id;

-- The catalog views (as in 20261201090000_sizes) gain the unit, last.

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
  p.unit_kind
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
  variant_group, variant_axis, variant_label, max_per_customer, sizes,
  unit_qty, unit_kind
from public.catalog_products_all
where archived_at is null;
