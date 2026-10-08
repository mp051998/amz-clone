-- Other sellers, as on Amazon: one product can be offered by more than one seller, new, renewed or
-- used ("New & Used (4) from $9.49"), each at its own price, stock and fulfilment.
--
-- Each offer is a products row of its own that names the product it's an offer of (offer_of), so
-- carts, Buy Now, checkout, stock, orders, cancellations and returns treat it as they treat any
-- product. The catalog view leaves offers out of browsing, search and the charts; the product page
-- lists them under "Other sellers", and an offer's own page is its product's. An offer keeps its
-- product's title, brand, image and category (copied in, and kept in step), and goes off sale
-- with it. Order lines keep the product and the condition they were bought in.

alter table public.products
  add column offer_of text references public.products (id) on delete cascade,
  add column condition text not null default 'new'
    check (condition in ('new', 'renewed', 'used_like_new', 'used_very_good', 'used_good', 'used_acceptable')),
  add column condition_note text check (length(btrim(condition_note)) between 1 and 200),
  add constraint products_offer_not_itself check (offer_of <> id),
  -- the product itself is always sold new; an offer has no variants, sizes or pre-order of its own
  add constraint products_offer_fields check (
    offer_of is not null
    or (condition = 'new' and condition_note is null)
  ),
  add constraint products_offer_plain check (
    offer_of is null
    or (variant_group is null and sizes is null and release_at is null)
  );

create index products_offer_of_idx on public.products (offer_of) where offer_of is not null;

-- admins write them like the other product fields (column grants, admin.sql)
grant insert (offer_of, condition, condition_note), update (offer_of, condition, condition_note) on public.products to authenticated;

-- an order line bought from another seller keeps which product it was an offer of, and its condition
alter table public.order_items
  add column offer_of text,
  add column condition text
    check (condition in ('renewed', 'used_like_new', 'used_very_good', 'used_good', 'used_acceptable'));

-- ---------------------------------------------------------------------------
-- An offer is of a product in the same store that isn't an offer itself (nor has offers), and
-- shows that product's title, brand, image and category (what carts, orders and coupons read).
-- ---------------------------------------------------------------------------
create function private.products_offer_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.products;
begin
  if new.offer_of is null then
    return new;
  end if;
  select * into v_parent from public.products p where p.id = new.offer_of;
  if not found or v_parent.offer_of is not null or v_parent.market_id <> new.market_id then
    raise exception 'invalid_input' using errcode = '22023', detail = 'offer_of';
  end if;
  if exists (select 1 from public.products p where p.offer_of = new.id) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'offer_of';
  end if;
  new.title := v_parent.title;
  new.brand := v_parent.brand;
  new.image := v_parent.image;
  new.category_slug := v_parent.category_slug;
  new.bullets := v_parent.bullets;
  new.unit_qty := v_parent.unit_qty;
  new.unit_kind := v_parent.unit_kind;
  -- an offer is never a deal, a badge holder or a list-price comparison of its own
  new.list_minor := null;
  new.deal_pct := null;
  new.deal := false;
  new.badge := null;
  new.bought_past_month := null;
  -- and isn't on sale while its product isn't
  if v_parent.archived_at is not null then
    new.archived_at := coalesce(new.archived_at, v_parent.archived_at);
  end if;
  return new;
end
$$;

revoke execute on function private.products_offer_before_write() from public, anon, authenticated;

create trigger products_offer_before_write
  before insert or update on public.products
  for each row execute function private.products_offer_before_write();

-- A product's offers follow it: its listing fields, and off sale (or back) with it.
create function private.products_offers_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products o
     set title = new.title,
         brand = new.brand,
         image = new.image,
         category_slug = new.category_slug,
         bullets = new.bullets,
         unit_qty = new.unit_qty,
         unit_kind = new.unit_kind,
         archived_at = case when new.archived_at is distinct from old.archived_at then new.archived_at else o.archived_at end
   where o.offer_of = new.id;
  return null;
end
$$;

revoke execute on function private.products_offers_follow() from public, anon, authenticated;

create trigger products_offers_follow
  after update of title, brand, image, category_slug, bullets, unit_qty, unit_kind, archived_at on public.products
  for each row
  when (new.offer_of is null)
  execute function private.products_offers_follow();

-- An order line keeps the product it was an offer of and the condition it was bought in (none for
-- the product itself, or new).
create function private.order_items_condition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.offer_of, nullif(p.condition, 'new') into new.offer_of, new.condition
  from public.products p where p.id = new.product_id;
  return new;
end
$$;

revoke execute on function private.order_items_condition() from public, anon, authenticated;

create trigger order_items_condition
  before insert on public.order_items
  for each row execute function private.order_items_condition();

-- ---------------------------------------------------------------------------
-- Buying an offer is buying the product: its review and answers are a verified purchase's.
-- (as in 20261020090000_verified_after_delivery, now counting the product's offers)
-- ---------------------------------------------------------------------------
create or replace function private.has_received(p_user uuid, p_product text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.user_id = p_user
      and o.status = 'placed'
      and o.delivered_at <= now()
      and (oi.product_id = p_product
           or oi.product_id in (select p.id from public.products p where p.offer_of = p_product))
  )
$$;

-- ---------------------------------------------------------------------------
-- The catalog views (as in 20261215090000_pre_orders) gain the offer fields, last; browsing
-- leaves offers out.
-- ---------------------------------------------------------------------------
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
  p.condition_note
from public.products p
join public.markets m on m.id = p.market_id
join public.categories c on c.slug = p.category_slug
-- an offer is rated as its product: reviews are the product's, whoever sold it
left join public.product_ratings r on r.product_id = coalesce(p.offer_of, p.id);

create or replace view public.catalog_products
with (security_invoker = true)
as
select
  id, market_id, currency, category_slug, category_name, title, brand, image,
  price_minor, list_minor, deal_pct, deal, badge, bought_past_month, seller,
  ships_from, bullets, stock, position, rating, review_count, badge_rank,
  variant_group, variant_axis, variant_label, max_per_customer, sizes,
  unit_qty, unit_kind, qty_discount_pct, qty_discount_min, release_at
from public.catalog_products_all
where archived_at is null and offer_of is null;

-- ---------------------------------------------------------------------------
-- A seller with offers on sale has a page too (as in 20261029090000_seller_profile, counting
-- offers).
-- ---------------------------------------------------------------------------
create or replace function public.seller_profile(p_market text, p_seller text)
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
     and not exists (select 1 from public.products p where p.market_id = p_market and p.seller = p_seller and p.archived_at is null)
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

-- ---------------------------------------------------------------------------
-- The store's other sellers: a few offers on popular books, headphones and laptops, from sellers
-- already in each store. (A fresh database's seed loads after this, without them, so the
-- integration tests' product pool stays as it was: tests make their own offers.)
-- ---------------------------------------------------------------------------
insert into public.products (id, market_id, offer_of, condition, condition_note, price_minor, seller, ships_from, stock, position,
                             category_slug, title, image)
select v.parent || '-' || v.suffix, p.market_id, p.id, v.condition, v.note, v.price, v.seller, v.ships_from, v.stock, p.position,
       p.category_slug, p.title, p.image
from (values
  -- US
  ('71oqUYvuOL',   'o1', 'new',             null,                                                               1650,  'Marketplace Seller', 'Amazon',      24),
  ('71oqUYvuOL',   'o2', 'used_very_good',  'Clean pages, no markings. Light wear on the cover edges.',           949,  'Lumen Store',        'Lumen Store',  3),
  ('71oqUYvuOL',   'o3', 'used_good',       'Some creases on the spine; a gift inscription inside the cover.',     725,  'Marketplace Seller', 'Amazon',       5),
  ('91RVshgQn1S',  'o1', 'new',             null,                                                               1599,  'Amazon.com',         'Amazon',      40),
  ('91RVshgQn1S',  'o2', 'used_like_new',   'Read once. No marks, tight spine.',                                  1120,  'Lumen Store',        'Lumen Store',  2),
  ('81MSoBpPAL',   'o1', 'used_very_good',  'Clean text; small shelf mark on the bottom edge.',                   1240,  'Marketplace Seller', 'Amazon',       4),
  ('81MSoBpPAL',   'o2', 'used_acceptable', 'Readable copy with highlighting in a few chapters and a worn cover.',  680,  'Lumen Store',        'Lumen Store',  6),
  ('81A4WdEAKgL',  'o1', 'renewed',         'Inspected, tested and cleaned; may show light signs of use. Charger included.', 45900, 'Marketplace Seller', 'Amazon', 4),
  ('81A4WdEAKgL',  'o2', 'used_like_new',   'Opened box; all accessories included. No marks on the lid or screen.', 48900, 'Lumen Store',        'Lumen Store',  1),
  ('51CnDMbXZzL',  'o1', 'new',             null,                                                              17150,  'Marketplace Seller', 'Amazon',      18),
  ('51CnDMbXZzL',  'o2', 'renewed',         'Tested to work like new; new ear cushions. Comes in a plain box.',    11900,  'Lumen Store',        'Lumen Store',  5),
  ('41lArSiD5hL',  'o1', 'used_like_new',   'Opened box, used once. All accessories included.',                  3890,  'Marketplace Seller', 'Amazon',       3),
  ('41lArSiD5hL',  'o2', 'renewed',         'Inspected and tested; light scuffs on the headband.',                3499,  'Lumen Store',        'Lumen Store',  7),
  ('81n1T4CYfmL',  'o1', 'renewed',         'Inspected, tested and cleaned; battery at least 80% of new.',      32900,  'Marketplace Seller', 'Amazon',       2),
  ('71HHF2jUnpL',  'o1', 'new',             null,                                                              89900,  'Marketplace Seller', 'Amazon',       9),
  ('71HHF2jUnpL',  'o2', 'renewed',         'Inspected, tested and cleaned; small scratch on the base.',         77900,  'Lumen Store',        'Lumen Store',  3),
  -- India
  ('in-81TGXuOMAL', 'o1', 'new',            null,                                                             184900,  'Cloudtail India',           'Amazon', 30),
  ('in-81TGXuOMAL', 'o2', 'renewed',        'Inspected and tested; new ear tips. Comes in a plain box.',        129900,  'Appario Retail Private Ltd', 'Amazon',  6),
  ('in-71QdB7hDCAL', 'o1', 'new',           null,                                                             152900,  'Cocoblu Retail',            'Amazon', 25),
  ('in-71QdB7hDCAL', 'o2', 'used_like_new', 'Opened box, used once. Charging cable included.',                  109900,  'RetailEZ Private Limited',  'Amazon',  3),
  ('in-61AccNkmFFL', 'o1', 'renewed',       'Inspected, tested and cleaned; battery at least 80% of new.',     3849000,  'Cloudtail India',           'Amazon',  4),
  ('in-61AccNkmFFL', 'o2', 'new',           null,                                                            4749000,  'Cocoblu Retail',            'Amazon', 12),
  ('in-71Ws1bRoM3L', 'o1', 'renewed',       'Inspected, tested and cleaned; light marks on the palm rest.',    5799000,  'RetailEZ Private Limited',  'Amazon',  3),
  ('in-7144dxKjVL', 'o1', 'used_very_good', 'Clean pages; slight fading on the cover.',                           7900,  'Cloudtail India',           'Amazon',  8),
  ('in-7144dxKjVL', 'o2', 'new',            null,                                                              11900,  'Appario Retail Private Ltd', 'Amazon', 40),
  ('in-814n9NoAW4L', 'o1', 'used_good',     'A few dog-eared pages; text clean.',                                24900,  'Cocoblu Retail',            'Amazon',  5),
  ('in-814n9NoAW4L', 'o2', 'new',           null,                                                              42500,  'Cloudtail India',           'Amazon', 20)
) as v (parent, suffix, condition, note, price, seller, ships_from, stock)
join public.products p on p.id = v.parent and p.offer_of is null
on conflict (id) do nothing;
