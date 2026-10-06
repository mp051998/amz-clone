-- ===========================================================================
-- Catalog admin: category management, archived products, insight refresh
-- ===========================================================================
-- Admins can now create, rename and delete categories, choose which stores
-- list them and in what order, and archive products instead of deleting them.
-- An archived product leaves every listing (catalog_products filters it out)
-- but its page, reviews and order history stay. Admin saves also refresh the
-- product's rules insight.

-- ---------------------------------------------------------------------------
-- categories — admins add, rename and delete. A slug never changes after
-- insert: products, URLs and saved searches all key on it.
-- ---------------------------------------------------------------------------
grant insert (slug, name), update (name), delete on public.categories to authenticated;

create policy "admins add categories" on public.categories
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins rename categories" on public.categories
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete categories" on public.categories
  for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- market_categories — which stores list a category, and where in the nav.
-- ---------------------------------------------------------------------------
grant insert (market_id, category_slug, position), update (position), delete
  on public.market_categories to authenticated;

create policy "admins list categories in stores" on public.market_categories
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins reorder store categories" on public.market_categories
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins unlist store categories" on public.market_categories
  for delete to authenticated using ((select public.is_admin()));

-- A store can't stop listing a category it still has products in (archived
-- ones included: restoring one needs its category listed). Also covers the
-- cascade from deleting the category itself.
create function public.market_categories_in_use()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.products p
    where p.market_id = old.market_id and p.category_slug = old.category_slug
  ) then
    raise exception 'category_in_use' using errcode = 'P0001', detail = old.category_slug;
  end if;
  return old;
end
$$;

create trigger market_categories_in_use
  before delete on public.market_categories
  for each row execute function public.market_categories_in_use();

-- Move a category up (p_offset < 0) or down the store's nav, then renumber
-- the store's positions 0..n-1.
create function public.move_category(p_market text, p_slug text, p_offset integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_slugs text[];
  v_from  integer;
  v_to    integer;
begin
  if not (select public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.market_categories mc where mc.market_id = p_market for update;
  select array_agg(mc.category_slug order by mc.position, mc.category_slug) into v_slugs
  from public.market_categories mc where mc.market_id = p_market;

  v_from := array_position(v_slugs, p_slug);
  if v_from is null then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  v_to := least(greatest(v_from + coalesce(p_offset, 0), 1), cardinality(v_slugs));

  v_slugs := array_remove(v_slugs, p_slug);
  v_slugs := v_slugs[1:v_to - 1] || p_slug || v_slugs[v_to:];

  update public.market_categories mc
     set position = s.ord - 1
    from unnest(v_slugs) with ordinality as s(slug, ord)
   where mc.market_id = p_market and mc.category_slug = s.slug and mc.position <> s.ord - 1;
end
$$;

revoke execute on function public.move_category(text, text, integer) from public;
grant execute on function public.move_category(text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Archived products
-- ---------------------------------------------------------------------------
alter table public.products add column archived_at timestamptz;

grant update (archived_at) on public.products to authenticated;

-- Products per store and category (archived counted separately), for the
-- admin categories page.
create function public.category_counts()
returns table (market_id text, category_slug text, products integer, archived integer)
language sql
stable
set search_path = ''
as $$
  select p.market_id, p.category_slug,
         count(*)::integer,
         (count(*) filter (where p.archived_at is not null))::integer
  from public.products p
  group by p.market_id, p.category_slug
$$;

-- Every product, archived included: product pages (which say "no longer
-- available"), carts and saved lists that already hold one, and admin.
create view public.catalog_products_all
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
  p.archived_at
from public.products p
join public.markets m on m.id = p.market_id
join public.categories c on c.slug = p.category_slug
left join public.product_ratings r on r.product_id = p.id;

-- The storefront read model: active products only. Listings, search, deals,
-- related products and compare all read this, so archiving needs no app change.
create or replace view public.catalog_products
with (security_invoker = true)
as
select
  id, market_id, currency, category_slug, category_name, title, brand, image,
  price_minor, list_minor, deal_pct, deal, badge, bought_past_month, seller,
  ships_from, bullets, stock, position, rating, review_count, badge_rank
from public.catalog_products_all
where archived_at is null;

revoke insert, update, delete, truncate on public.catalog_products_all from anon, authenticated;

-- Whether a product appears on any order (so it can only be archived, not
-- deleted). SECURITY DEFINER to see every customer's orders; admins only.
create function public.product_has_orders(p_product_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return exists (select 1 from public.order_items oi where oi.product_id = p_product_id);
end
$$;

revoke execute on function public.product_has_orders(text) from public, anon;
grant execute on function public.product_has_orders(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- product_insights — admins refresh a product's rules insight when they save it.
-- ---------------------------------------------------------------------------
grant insert, update on public.product_insights to authenticated;

create policy "admins add insights" on public.product_insights
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins refresh insights" on public.product_insights
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Carts, orders and saved lists: an archived product can't be added or
-- bought. Lines already in a cart stay visible (marked unavailable) until the
-- shopper removes them.
-- ---------------------------------------------------------------------------
create or replace function private.cart_json(p_market text, p_cart uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lines jsonb;
  v_count integer;
  v_sub   integer;
  v_t     record;
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product', to_jsonb(cp),
      'qty', ci.qty,
      'line_total_minor', cp.price_minor * ci.qty,
      'in_stock', cp.archived_at is null and cp.stock >= ci.qty,
      'available', cp.archived_at is null
    ) order by ci.added_at, ci.product_id), '[]'::jsonb),
    coalesce(sum(ci.qty), 0)::integer,
    coalesce(sum(cp.price_minor * ci.qty), 0)::integer
  into v_lines, v_count, v_sub
  from public.cart_items ci
  join public.catalog_products_all cp on cp.id = ci.product_id
  where p_cart is not null and ci.cart_id = p_cart;

  select * into v_t from public.order_totals(p_market, v_sub);

  return jsonb_build_object(
    'market', p_market,
    'currency', (select m.currency from public.markets m where m.id = p_market),
    'free_ship_threshold_minor', (select m.free_ship_threshold_minor from public.markets m where m.id = p_market),
    'lines', v_lines,
    'count', v_count,
    'totals', jsonb_build_object(
      'subtotal_minor', v_t.subtotal_minor,
      'ship_minor', v_t.ship_minor,
      'tax_minor', v_t.tax_minor,
      'total_minor', v_t.total_minor
    )
  );
end
$$;

/**
 * Set (p_mode 'set') or increment (p_mode 'add') a line. Quantity is capped at
 * the market's per-line maximum and at available stock; 0 removes the line.
 * An archived product can only be removed.
 */
create or replace function public.cart_set_qty(
  p_market      text,
  p_product_id  text,
  p_qty         integer,
  p_mode        text default 'set',
  p_guest_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_cart    uuid;
  v_max     integer;
  v_new     integer;
begin
  if p_mode not in ('set', 'add') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  if auth.uid() is null and p_guest_token is null then
    raise exception 'cart_token_required' using errcode = '22023';
  end if;

  select p.id, p.market_id, p.stock, p.archived_at into v_product
  from public.products p where p.id = p_product_id;
  if not found or v_product.market_id <> p_market then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  v_cart := private.cart_id(p_market, p_guest_token, true);
  select m.max_line_qty into v_max from public.markets m where m.id = p_market;

  if p_mode = 'add' then
    v_new := coalesce((select ci.qty from public.cart_items ci
                       where ci.cart_id = v_cart and ci.product_id = p_product_id), 0)
             + greatest(coalesce(p_qty, 1), 1);
  else
    v_new := coalesce(p_qty, 0);
  end if;
  v_new := least(v_new, v_max);

  if v_new <= 0 then
    delete from public.cart_items ci where ci.cart_id = v_cart and ci.product_id = p_product_id;
  else
    if v_product.archived_at is not null then
      raise exception 'product_unavailable' using errcode = 'P0001';
    end if;
    if v_product.stock <= 0 then
      raise exception 'out_of_stock' using errcode = 'P0001';
    end if;
    v_new := least(v_new, v_product.stock);
    insert into public.cart_items (cart_id, product_id, qty)
    values (v_cart, p_product_id, v_new)
    on conflict (cart_id, product_id) do update set qty = excluded.qty;
  end if;

  update public.carts c set updated_at = now() where c.id = v_cart;
  return private.cart_json(p_market, v_cart);
end
$$;

-- After sign-in: fold every guest cart for this token into the user's carts.
-- Archived and sold-out products are dropped.
create or replace function public.cart_merge_guest(p_guest_token uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_guest  record;
  v_cart   uuid;
  v_merged integer := 0;
  v_n      integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_guest_token is null then
    return 0;
  end if;

  for v_guest in
    select c.id, c.market_id from public.carts c where c.guest_token = p_guest_token
  loop
    v_cart := private.cart_id(v_guest.market_id, null, true);

    insert into public.cart_items (cart_id, product_id, qty, added_at)
    select v_cart, gi.product_id, least(gi.qty, m.max_line_qty, greatest(p.stock, 1)), gi.added_at
    from public.cart_items gi
    join public.products p on p.id = gi.product_id
    join public.markets m on m.id = v_guest.market_id
    where gi.cart_id = v_guest.id and p.stock > 0 and p.archived_at is null
    on conflict (cart_id, product_id) do update
      set qty = least(
        public.cart_items.qty + excluded.qty,
        (select m2.max_line_qty from public.markets m2 where m2.id = v_guest.market_id),
        greatest((select p2.stock from public.products p2 where p2.id = excluded.product_id), 1)
      );
    get diagnostics v_n = row_count;
    v_merged := v_merged + v_n;

    delete from public.carts c where c.id = v_guest.id;
  end loop;

  return v_merged;
end
$$;

/**
 * Turn the caller's cart into an order. Locks the product rows, checks and
 * reserves stock, prices every line from the catalog (never from the client),
 * and snapshots title/image/price. Card orders start 'awaiting_payment' and
 * keep the cart until Stripe confirms; every other method is placed at once.
 * A cart holding an archived product can't be checked out.
 */
create or replace function public.place_order(p_market text, p_payment_method text, p_shipping jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_ship     jsonb := coalesce(p_shipping, '{}'::jsonb);
  v_methods  text[];
  v_cart     uuid;
  v_line     record;
  v_sub      integer;
  v_t        record;
  v_order_id text;
  v_status   text;
  v_name     text := private.clean_text(v_ship, 'full_name', 80);
  v_phone    text := regexp_replace(coalesce(private.clean_text(v_ship, 'phone', 20), ''), '[^0-9+]', '', 'g');
  v_line1    text := private.clean_text(v_ship, 'line1', 120);
  v_line2    text := private.clean_text(v_ship, 'line2', 120);
  v_landmark text := private.clean_text(v_ship, 'landmark', 80);
  v_city     text := private.clean_text(v_ship, 'city', 60);
  v_state    text := private.clean_text(v_ship, 'state', 60);
  v_postcode text := private.clean_text(v_ship, 'postcode', 12);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select m.payment_methods into v_methods from public.markets m where m.id = p_market;
  if v_methods is null then
    raise exception 'unknown_market' using errcode = '22023';
  end if;
  if not (p_payment_method = any (v_methods)) then
    raise exception 'payment_method_unavailable' using errcode = '22023';
  end if;

  if v_name is null or v_phone !~ '^\+?[0-9]{10,15}$' or v_line1 is null or v_city is null
     or v_state is null or (p_market = 'IN' and v_line2 is null) then
    raise exception 'invalid_shipping_address' using errcode = '22023';
  end if;
  if not private.valid_postcode(p_market, v_postcode) then
    raise exception 'invalid_postcode' using errcode = '22023';
  end if;

  -- a fresh checkout abandons any earlier unpaid one in this store
  perform private.cancel_order(o.id)
  from public.orders o
  where o.user_id = v_uid and o.market_id = p_market and o.status = 'awaiting_payment';

  select c.id into v_cart from public.carts c where c.user_id = v_uid and c.market_id = p_market;
  if v_cart is null or not exists (select 1 from public.cart_items ci where ci.cart_id = v_cart) then
    raise exception 'cart_empty' using errcode = 'P0001';
  end if;

  -- lock in a stable order (deadlock-safe) and verify every line is on sale and in stock
  for v_line in
    select ci.product_id, ci.qty, p.stock, p.archived_at
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart
    order by ci.product_id
    for update of p
  loop
    if v_line.archived_at is not null then
      raise exception 'product_unavailable' using errcode = 'P0001', detail = v_line.product_id;
    end if;
    if v_line.stock < v_line.qty then
      raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_line.product_id;
    end if;
  end loop;

  select coalesce(sum(p.price_minor * ci.qty), 0)::integer into v_sub
  from public.cart_items ci join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart;
  select * into v_t from public.order_totals(p_market, v_sub);

  v_order_id := private.new_order_id(p_market);
  v_status := case when p_payment_method = 'card' then 'awaiting_payment' else 'placed' end;

  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, ship_minor, tax_minor, total_minor,
    ship_name, ship_phone, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postcode,
    placed_at
  )
  values (
    v_order_id, v_uid, p_market, (select m.currency from public.markets m where m.id = p_market),
    v_status, p_payment_method,
    case p_payment_method
      when 'card' then 'Card'
      when 'giftcard' then 'Amazon gift card balance'
      when 'upi' then 'UPI'
      when 'netbanking' then 'Net banking'
      when 'cod' then 'Cash on Delivery'
      when 'emi' then 'EMI'
      when 'amazonpay' then 'Amazon Pay balance'
    end,
    v_t.subtotal_minor, v_t.ship_minor, v_t.tax_minor, v_t.total_minor,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
    case when v_status = 'placed' then now() end
  );

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty)
  select v_order_id,
         row_number() over (order by ci.added_at, ci.product_id),
         p.id, p.title, p.image, p.seller, p.price_minor, ci.qty
  from public.cart_items ci join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart;

  update public.products p
     set stock = p.stock - ci.qty
    from public.cart_items ci
   where ci.cart_id = v_cart and p.id = ci.product_id;

  if v_status = 'placed' then
    delete from public.cart_items ci where ci.cart_id = v_cart;
  end if;

  return private.order_json(v_order_id);
end
$$;

-- Saved lists keep archived products they already hold, but can't gain new ones.
create or replace function public.collection_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_market   text;
  v_price    integer;
  v_archived timestamptz;
begin
  if tg_op = 'UPDATE' then
    -- items are immutable apart from delete + re-add
    new.collection_id := old.collection_id;
    new.product_id := old.product_id;
    new.saved_price_minor := old.saved_price_minor;
    new.added_at := old.added_at;
    return new;
  end if;

  select p.price_minor, p.archived_at into v_price, v_archived
  from public.products p
  join public.collections c on c.id = new.collection_id and c.market_id = p.market_id
  where p.id = new.product_id;
  if v_price is null then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if v_archived is not null then
    raise exception 'product_unavailable' using errcode = 'P0001';
  end if;
  if (select count(*) from public.collection_items i where i.collection_id = new.collection_id) >= 200 then
    raise exception 'collection_item_limit' using errcode = 'P0001', hint = 'At most 200 items per collection.';
  end if;
  new.saved_price_minor := v_price;
  new.added_at := now();
  return new;
end
$$;
