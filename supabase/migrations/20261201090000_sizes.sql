-- Sizes, as Amazon's "Size:" picker on clothes and shoes: a product can list the sizes it comes
-- in, and a shopper picks one before it goes in the cart or to Buy Now. The size travels with
-- the cart line into the order line (and its cancellations and returns). Sizes share the
-- product's stock.
--
-- A cart (and an order) still holds a product once, in one size: adding it again in another
-- size is refused (size_in_cart) and the cart's line can change size instead (cart_set_size).
-- A line whose product has sizes but whose size isn't one of them (picked before the product's
-- sizes changed) needs a size before checkout (needs_size; place_order() refuses it with
-- size_required).

alter table public.products
  add column sizes text[] check (sizes is null or (cardinality(sizes) between 1 and 20 and array_position(sizes, null) is null));

-- admins write it like the other product fields (column grants, admin.sql)
grant insert (sizes), update (sizes) on public.products to authenticated;

alter table public.cart_items
  add column size text check (length(size) between 1 and 12);

alter table public.order_items
  add column size text check (length(size) between 1 and 12);

alter table public.order_cancelled_items
  add column size text check (length(size) between 1 and 12);

-- The store's clothes and shoes come in sizes (a fresh database's seed loads after this, without
-- them, so the integration tests' product pool stays as it was: tests give their own products sizes).
update public.products set sizes = array['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12']
 where id in ('51AMW3KWC6L', '41XNghIdXQL', '61KSCqZfL', '410L0vF3L', '71dRz5HBeTL', '71OAOMRQJYL',
              '51aZZVEq3iL', '71d5H67c0SL', '51wnMZWbCWL', '81TMcoN7PL', '61XF87S1OEL', '61rRTa5GL');
update public.products set sizes = array['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11']
 where id in ('in-61rWcMP4s9L', 'in-61Il0xGaORL', 'in-61XwYMOyfwL', 'in-612dWsWvGRL', 'in-719ojmA9G7L', 'in-61TxjQ3FzEL');
update public.products set sizes = array['UK 3', 'UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8']
 where id in ('in-712NemmvADL', 'in-61IZBgcmGL', 'in-61vRXtZcy7L', 'in-61abSFH0qL');
update public.products set sizes = array['S', 'M', 'L', 'XL', 'XXL']
 where id in ('in-717qtxFpeaL', 'in-514vCNWtZDL', 'in-41uhw1abTpL', 'in-41T5wfyFb8L', 'in-61xTfKaqUlL');

-- The catalog views (as in 20261124090000_purchase_limits) gain the sizes, last.

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
  p.sizes
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
  variant_group, variant_axis, variant_label, max_per_customer, sizes
from public.catalog_products_all
where archived_at is null;

-- ---------------------------------------------------------------------------
-- Whether a line's size is one its product comes in (true for a product without sizes).
-- ---------------------------------------------------------------------------
create function private.size_ok(p_sizes text[], p_size text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_sizes is null or coalesce(p_size = any (p_sizes), false)
$$;

revoke execute on function private.size_ok(text[], text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- cart_lines (as in 20261122090000_cart_price_changes) and selected_lines (as in
-- 20261118090000_protection_plans): each line carries its size.
-- ---------------------------------------------------------------------------
create or replace function private.cart_lines(p_cart uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'qty', x.qty, 'n', x.n, 'selected', x.selected, 'protection', x.protection,
                                    'added_price_minor', x.added_price_minor, 'size', x.size) order by x.n), '[]'::jsonb)
  from (
    select ci.product_id, ci.qty, ci.selected, ci.protection, ci.added_price_minor, ci.size, row_number() over (order by ci.added_at, ci.product_id) as n
    from public.cart_items ci
    where p_cart is not null and ci.cart_id = p_cart
  ) x
$$;

create or replace function private.selected_lines(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'qty', x.qty, 'n', x.rn, 'protection', x.protection, 'size', x.size) order by x.rn), '[]'::jsonb)
  from (
    select l.product_id, l.qty, coalesce(l.protection, false) as protection, l.size, row_number() over (order by l.n) as rn
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, n integer, selected boolean, protection boolean, size text)
    where coalesce(l.selected, true)
  ) x
$$;

-- ---------------------------------------------------------------------------
-- checkout_json (as in 20261123090000_promo_codes): each line says its size, and needs_size when
-- its product has sizes and the line has none of them.
-- ---------------------------------------------------------------------------
create or replace function private.checkout_json(p_market text, p_uid uuid, p_items jsonb, p_promo jsonb default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lines jsonb;
  v_count integer;
  v_picked integer;
  v_sub   integer;
  v_disc  integer;
  v_prot  integer;
  v_promo integer;
  v_t     record;
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product', to_jsonb(cp),
      'qty', l.qty,
      'selected', coalesce(l.selected, true),
      'line_total_minor', cp.price_minor * l.qty,
      'in_stock', cp.archived_at is null and cp.stock >= l.qty,
      'available', cp.archived_at is null,
      'coupon', case when cou.percent_off is not null
                     then jsonb_build_object('percent_off', cou.percent_off, 'clipped', cc.user_id is not null) end,
      'discount_minor', (cd.unit + pd.unit) * l.qty,
      'promo_minor', pd.unit * l.qty,
      'protection_unit_minor', pu.unit,
      'protection', coalesce(l.protection, false) and pu.unit is not null,
      'added_price_minor', l.added_price_minor,
      'size', case when cp.sizes is not null then l.size end,
      'needs_size', not private.size_ok(cp.sizes, l.size)
    ) order by l.n), '[]'::jsonb),
    coalesce(sum(l.qty), 0)::integer,
    coalesce(sum(l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(cp.price_minor * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum((cd.unit + pd.unit) * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(pd.unit * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(pu.unit * l.qty) filter (where coalesce(l.selected, true) and coalesce(l.protection, false)), 0)::integer
  into v_lines, v_count, v_picked, v_sub, v_disc, v_promo, v_prot
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, n integer, selected boolean, protection boolean, added_price_minor integer, size text)
  join public.catalog_products_all cp on cp.id = l.product_id
  cross join lateral (select private.protection_unit_minor(p_market, cp.category_slug, cp.price_minor) as unit) pu
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = p_uid and cc.product_id = l.product_id
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor) as unit) cd
  cross join lateral (select private.promo_unit_discount(p_promo, cp.category_slug, cp.price_minor, cd.unit) as unit) pd;

  -- delivery's free threshold and tax go by what's paid for the items
  select * into v_t from public.order_totals(p_market, v_sub - v_disc);

  return jsonb_build_object(
    'market', p_market,
    'currency', (select m.currency from public.markets m where m.id = p_market),
    'free_ship_threshold_minor', (select m.free_ship_threshold_minor from public.markets m where m.id = p_market),
    'lines', v_lines,
    'count', v_count,
    'selected_count', v_picked,
    'promo', case when p_promo ? 'code' then p_promo - 'error' end,
    'totals', jsonb_build_object(
      'subtotal_minor', v_sub,
      'discount_minor', v_disc,
      'promo_minor', v_promo,
      'ship_minor', v_t.ship_minor,
      'tax_minor', v_t.tax_minor,
      'protection_minor', v_prot,
      'total_minor', v_t.total_minor + v_prot
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- cart_set_qty (as in 20261022090000_cart_select) takes the size. Adding a product that has
-- sizes needs one of them (size_required / invalid_input); adding it in another size than its
-- line's is refused (size_in_cart). Setting a quantity keeps the line's size, or takes p_size.
-- A size for a product without sizes is invalid_input. The old signature goes, so PostgREST
-- sees one function.
-- ---------------------------------------------------------------------------
drop function public.cart_set_qty(text, text, integer, text, uuid);

create function public.cart_set_qty(
  p_market      text,
  p_product_id  text,
  p_qty         integer,
  p_mode        text default 'set',
  p_guest_token uuid default null,
  p_size        text default null
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
  v_line    record;
  v_size    text := nullif(btrim(coalesce(p_size, '')), '');
begin
  if p_mode not in ('set', 'add') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  if auth.uid() is null and p_guest_token is null then
    raise exception 'cart_token_required' using errcode = '22023';
  end if;

  select p.id, p.market_id, p.stock, p.archived_at, p.sizes into v_product
  from public.products p where p.id = p_product_id;
  if not found or v_product.market_id <> p_market then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if v_size is not null and (v_product.sizes is null or not (v_size = any (v_product.sizes))) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'size';
  end if;

  v_cart := private.cart_id(p_market, p_guest_token, true);
  select m.max_line_qty into v_max from public.markets m where m.id = p_market;
  select ci.qty, ci.size into v_line from public.cart_items ci where ci.cart_id = v_cart and ci.product_id = p_product_id;

  if p_mode = 'add' then
    v_new := coalesce(v_line.qty, 0) + greatest(coalesce(p_qty, 1), 1);
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
    if v_product.sizes is not null then
      if p_mode = 'add' and v_size is null then
        raise exception 'size_required' using errcode = 'P0001', detail = p_product_id;
      end if;
      -- a line already in the cart in one of the sizes stays in it
      if p_mode = 'add' and v_line.size is not null and v_line.size <> v_size and v_line.size = any (v_product.sizes) then
        raise exception 'size_in_cart' using errcode = 'P0001', detail = v_line.size;
      end if;
      if v_line is null and v_size is null then
        raise exception 'size_required' using errcode = 'P0001', detail = p_product_id;
      end if;
    end if;
    v_new := least(v_new, v_product.stock);
    insert into public.cart_items as ci (cart_id, product_id, qty, size)
    values (v_cart, p_product_id, v_new, v_size)
    on conflict (cart_id, product_id) do update
      set qty = excluded.qty,
          size = coalesce(excluded.size, ci.size),
          selected = ci.selected or p_mode = 'add';
  end if;

  update public.carts c set updated_at = now() where c.id = v_cart;
  return private.cart_json(p_market, v_cart);
end
$$;

revoke execute on function public.cart_set_qty(text, text, integer, text, uuid, text) from public;
grant execute on function public.cart_set_qty(text, text, integer, text, uuid, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cart_set_size: change the size of a cart line to another its product comes in.
-- ---------------------------------------------------------------------------
create function public.cart_set_size(p_market text, p_product_id text, p_size text, p_guest_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart  uuid;
  v_sizes text[];
  v_size  text := nullif(btrim(coalesce(p_size, '')), '');
begin
  if auth.uid() is null and p_guest_token is null then
    raise exception 'cart_token_required' using errcode = '22023';
  end if;
  select p.sizes into v_sizes from public.products p where p.id = p_product_id and p.market_id = p_market;
  if v_size is null or v_sizes is null or not (v_size = any (v_sizes)) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'size';
  end if;

  v_cart := private.cart_id(p_market, p_guest_token, false);
  update public.cart_items ci set size = v_size where ci.cart_id = v_cart and ci.product_id = p_product_id;
  if not found then
    raise exception 'not_in_cart' using errcode = 'P0002';
  end if;

  update public.carts c set updated_at = now() where c.id = v_cart;
  return private.cart_json(p_market, v_cart);
end
$$;

revoke execute on function public.cart_set_size(text, text, text, uuid) from public;
grant execute on function public.cart_set_size(text, text, text, uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cart_merge_guest (as in 20261122090000_cart_price_changes): a guest's line brings its size; a
-- line the account already has keeps its own.
-- ---------------------------------------------------------------------------
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

    insert into public.cart_items (cart_id, product_id, qty, added_at, protection, added_price_minor, size)
    select v_cart, gi.product_id, least(gi.qty, m.max_line_qty, greatest(p.stock, 1)), gi.added_at, gi.protection, gi.added_price_minor, gi.size
    from public.cart_items gi
    join public.products p on p.id = gi.product_id
    join public.markets m on m.id = v_guest.market_id
    where gi.cart_id = v_guest.id and p.stock > 0 and p.archived_at is null
    on conflict (cart_id, product_id) do update
      set qty = least(
        public.cart_items.qty + excluded.qty,
        (select m2.max_line_qty from public.markets m2 where m2.id = v_guest.market_id),
        greatest((select p2.stock from public.products p2 where p2.id = excluded.product_id), 1)
      ),
      protection = public.cart_items.protection or excluded.protection,
      size = coalesce(public.cart_items.size, excluded.size);
    get diagnostics v_n = row_count;
    v_merged := v_merged + v_n;

    delete from public.carts c where c.id = v_guest.id;
  end loop;

  return v_merged;
end
$$;

-- ---------------------------------------------------------------------------
-- Buy Now's line (as in 20261118090000_protection_plans) and quote carry the size picked.
-- ---------------------------------------------------------------------------
drop function public.buy_now_quote(text, text, integer, boolean);
drop function private.buy_now_line(text, text, integer, boolean);

create function private.buy_now_line(p_market text, p_product text, p_qty integer, p_protection boolean default false, p_size text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_market text;
  v_max    integer;
begin
  select p.market_id into v_market from public.products p where p.id = p_product;
  if not found or v_market <> p_market then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  select m.max_line_qty into v_max from public.markets m where m.id = p_market;
  return jsonb_build_array(jsonb_build_object(
    'product_id', p_product,
    'qty', least(greatest(coalesce(p_qty, 1), 1), v_max),
    'n', 1,
    'protection', coalesce(p_protection, false),
    'size', nullif(btrim(left(coalesce(p_size, ''), 12)), '')
  ));
end
$$;

revoke execute on function private.buy_now_line(text, text, integer, boolean, text) from public, anon, authenticated;

create function public.buy_now_quote(p_market text, p_product text, p_qty integer default 1, p_protection boolean default false, p_size text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return private.checkout_json(p_market, auth.uid(), private.buy_now_line(p_market, p_product, p_qty, p_protection, p_size));
end
$$;

revoke execute on function public.buy_now_quote(text, text, integer, boolean, text) from public, anon;
grant execute on function public.buy_now_quote(text, text, integer, boolean, text) to authenticated, service_role;

-- checkout_quote (as in 20261123090000_promo_codes): Buy Now's {product_id, qty, protection, size}.
create or replace function public.checkout_quote(p_market text, p_promo_code text, p_buy jsonb default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_cart  uuid;
  v_items jsonb;
  v_promo jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_buy is null then
    select c.id into v_cart from public.carts c where c.user_id = v_uid and c.market_id = p_market;
    v_items := private.cart_lines(v_cart);
  else
    v_items := private.buy_now_line(
      p_market,
      p_buy ->> 'product_id',
      case when p_buy ->> 'qty' ~ '^[0-9]{1,4}$' then (p_buy ->> 'qty')::integer else 1 end,
      coalesce(p_buy ->> 'protection', '') = 'true',
      p_buy ->> 'size'
    );
  end if;
  v_promo := private.promo_check(p_market, v_uid, p_promo_code, v_items);
  return jsonb_build_object(
    'cart', private.checkout_json(p_market, v_uid, v_items, case when v_promo ? 'error' then null else v_promo end),
    'promo_error', v_promo ->> 'error',
    'promo_error_detail', v_promo ->> 'detail'
  );
end
$$;

-- ---------------------------------------------------------------------------
-- place_order (as in 20261123090000_promo_codes): Buy Now's p_buy takes the size; a line whose
-- product has sizes needs one of them (size_required, detail: the product id); the order line
-- keeps it.
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_market text,
  p_payment_method text,
  p_shipping jsonb,
  p_gift boolean default false,
  p_gift_message text default null,
  p_speed text default 'standard',
  -- Buy Now: {product_id, qty, protection, size}; the order is that line alone and the cart is left as it is
  p_buy jsonb default null,
  -- gift wrap for every item, at the store's fee per unit; only for a gift
  p_gift_wrap boolean default false,
  -- EMI: how many monthly payments (3, 6, 9 or 12; 3 when not said); ignored for other methods
  p_emi_months integer default null,
  -- a promotion code typed at checkout; blank is none
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_ship      jsonb := coalesce(p_shipping, '{}'::jsonb);
  v_methods   text[];
  v_from_cart boolean := p_buy is null;
  v_cart      uuid;
  v_items     jsonb;
  v_line      record;
  v_sub       integer;
  v_disc      integer;
  v_promo     jsonb;
  v_promo_sum integer;
  v_t         record;
  v_speed     text := coalesce(p_speed, 'standard');
  v_ship_fee  integer;
  v_wrap      integer := 0;
  v_wrap_fee  integer;
  v_prot      integer;
  v_total     integer;
  v_emi       integer := case when p_payment_method = 'emi' then coalesce(p_emi_months, 3) end;
  v_emi_min   integer;
  v_order_id  text;
  v_status    text;
  v_name      text := private.clean_text(v_ship, 'full_name', 80);
  v_phone     text := regexp_replace(coalesce(private.clean_text(v_ship, 'phone', 20), ''), '[^0-9+]', '', 'g');
  v_line1     text := private.clean_text(v_ship, 'line1', 120);
  v_line2     text := private.clean_text(v_ship, 'line2', 120);
  v_landmark  text := private.clean_text(v_ship, 'landmark', 80);
  v_city      text := private.clean_text(v_ship, 'city', 60);
  v_state     text := private.clean_text(v_ship, 'state', 60);
  v_postcode  text := private.clean_text(v_ship, 'postcode', 12);
  v_instr     text := private.clean_text(v_ship, 'instructions', 250);
  v_gift      boolean := coalesce(p_gift, false);
  -- only a gift carries a note; blank is none
  v_note      text := case when coalesce(p_gift, false)
                       then nullif(btrim(left(btrim(coalesce(p_gift_message, '')), 240)), '') end;
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
  if v_emi is not null and v_emi not in (3, 6, 9, 12) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'emi_months';
  end if;

  if v_name is null or v_phone !~ '^\+?[0-9]{10,15}$' or v_line1 is null or v_city is null
     or v_state is null or (p_market = 'IN' and v_line2 is null) then
    raise exception 'invalid_shipping_address' using errcode = '22023';
  end if;
  if not private.valid_postcode(p_market, v_postcode) then
    raise exception 'invalid_postcode' using errcode = '22023';
  end if;
  if not (v_speed = 'standard' or (v_speed = 'fast' and private.fast_delivery_offered(p_market, now()))) then
    raise exception 'delivery_option_unavailable' using errcode = '22023';
  end if;
  if coalesce(p_gift_wrap, false) then
    select m.gift_wrap_minor into v_wrap_fee from public.markets m where m.id = p_market;
    if not v_gift or v_wrap_fee is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'gift_wrap';
    end if;
  end if;

  if v_from_cart then
    select c.id into v_cart from public.carts c where c.user_id = v_uid and c.market_id = p_market;
    v_items := private.cart_lines(v_cart);
    if jsonb_array_length(v_items) = 0 then
      raise exception 'cart_empty' using errcode = 'P0001';
    end if;
    v_items := private.selected_lines(v_items);
    if jsonb_array_length(v_items) = 0 then
      raise exception 'nothing_selected' using errcode = 'P0001';
    end if;
  else
    v_items := private.buy_now_line(
      p_market,
      p_buy ->> 'product_id',
      case when p_buy ->> 'qty' ~ '^[0-9]{1,4}$' then (p_buy ->> 'qty')::integer else 1 end,
      coalesce(p_buy ->> 'protection', '') = 'true',
      p_buy ->> 'size'
    );
  end if;

  -- a fresh checkout abandons any earlier unpaid one in this store
  perform private.cancel_order(o.id)
  from public.orders o
  where o.user_id = v_uid and o.market_id = p_market and o.status = 'awaiting_payment';

  -- a promotion code must apply to what's being bought; one checkout at a time per shopper, so a
  -- code meant once per customer can't be spent twice at once
  if nullif(btrim(coalesce(p_promo_code, '')), '') is not null then
    perform pg_advisory_xact_lock(hashtext('promo:' || v_uid::text));
    v_promo := private.promo_check(p_market, v_uid, p_promo_code, v_items);
    if v_promo ? 'error' then
      if v_promo ? 'detail' then
        raise exception '%', v_promo ->> 'error' using errcode = 'P0001', detail = v_promo ->> 'detail';
      end if;
      raise exception '%', v_promo ->> 'error' using errcode = 'P0001';
    end if;
  end if;

  -- lock in a stable order (deadlock-safe) and verify every line is on sale, in stock and sized
  for v_line in
    select l.product_id, l.qty, l.size, p.stock, p.archived_at, p.sizes
    from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer, size text)
    join public.products p on p.id = l.product_id
    order by l.product_id
    for update of p
  loop
    if v_line.archived_at is not null then
      raise exception 'product_unavailable' using errcode = 'P0001', detail = v_line.product_id;
    end if;
    if v_line.stock < v_line.qty then
      raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_line.product_id;
    end if;
    if not private.size_ok(v_line.sizes, v_line.size) then
      raise exception 'size_required' using errcode = 'P0001', detail = v_line.product_id;
    end if;
  end loop;

  -- coupons first, then the promotion on what's left of each qualifying unit
  select coalesce(sum(p.price_minor * l.qty), 0)::integer,
         coalesce(sum((cd.unit + pd.unit) * l.qty), 0)::integer,
         coalesce(sum(pd.unit * l.qty), 0)::integer
    into v_sub, v_disc, v_promo_sum
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor) as unit) cd
  cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor, cd.unit) as unit) pd;
  -- delivery's free threshold and tax go by what's paid for the items
  select * into v_t from public.order_totals(p_market, v_sub - v_disc);
  -- faster delivery has its own fee, free only for Plus members
  v_ship_fee := case when v_speed <> 'fast' then v_t.ship_minor
                     when private.is_plus_member(v_uid) then 0
                     else (select m.fast_ship_fee_minor from public.markets m where m.id = p_market) end;
  -- protection plans are per unit too, untaxed, for the lines that asked and still qualify
  select coalesce(sum(private.protection_unit_minor(p_market, p.category_slug, p.price_minor) * l.qty)
                  filter (where l.protection), 0)::integer
    into v_prot
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer, protection boolean)
  join public.products p on p.id = l.product_id;
  -- gift wrap is per unit, untaxed, and has no bearing on free delivery
  if v_wrap_fee is not null then
    select v_wrap_fee * coalesce(sum(l.qty), 0)::integer into v_wrap
    from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer);
  end if;

  v_total := v_sub - v_disc + v_ship_fee + v_t.tax_minor + v_wrap + v_prot;
  -- EMI only from the store's minimum order up
  if v_emi is not null then
    select m.emi_min_minor into v_emi_min from public.markets m where m.id = p_market;
    if v_emi_min is null or v_total < v_emi_min then
      raise exception 'emi_unavailable' using errcode = '22023';
    end if;
  end if;

  v_order_id := private.new_order_id(p_market);
  v_status := case when p_payment_method = 'card' then 'awaiting_payment' else 'placed' end;

  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, discount_minor, ship_minor, tax_minor, wrap_minor, protection_minor, total_minor,
    ship_name, ship_phone, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postcode,
    ship_instructions, gift, gift_message, gift_wrap, ship_speed, from_cart, placed_at, emi_months, promo_code
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
      when 'emi' then 'EMI · ' || v_emi || ' months'
      when 'amazonpay' then 'Amazon Pay balance'
    end,
    v_sub, v_disc, v_ship_fee, v_t.tax_minor, v_wrap, v_prot, v_total,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
    v_instr, v_gift, v_note, v_wrap > 0, v_speed, v_from_cart,
    case when v_status = 'placed' then now() end, v_emi, v_promo ->> 'code'
  );

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty, unit_discount_minor, unit_promo_minor, protection_minor, size)
  select v_order_id, l.n, p.id, p.title, p.image, p.seller, p.price_minor, l.qty,
         cd.unit + pd.unit, pd.unit,
         case when l.protection then coalesce(private.protection_unit_minor(p_market, p.category_slug, p.price_minor), 0) else 0 end,
         case when p.sizes is not null then l.size end
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer, protection boolean, size text)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor) as unit) cd
  cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor, cd.unit) as unit) pd;

  update public.products p
     set stock = p.stock - l.qty
    from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
   where p.id = l.product_id;

  -- only what was ordered leaves the cart; unticked lines wait for next time
  if v_status = 'placed' and v_from_cart then
    delete from public.cart_items ci
     using jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
     where ci.cart_id = v_cart and ci.product_id = l.product_id;
  end if;

  return private.order_json(v_order_id);
end
$$;

-- ---------------------------------------------------------------------------
-- A cancelled item keeps its size: copied from its order line as it's written, so
-- cancel_my_items() needs no change.
-- ---------------------------------------------------------------------------
create function private.order_cancelled_items_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.size is null then
    select oi.size into new.size from public.order_items oi where oi.order_id = new.order_id and oi.product_id = new.product_id;
  end if;
  return new;
end
$$;

revoke execute on function private.order_cancelled_items_size() from public, anon, authenticated;

create trigger order_cancelled_items_size
  before insert on public.order_cancelled_items
  for each row execute function private.order_cancelled_items_size();

-- ---------------------------------------------------------------------------
-- return_json (as in 20261121090000_not_received): each item says its size.
-- ---------------------------------------------------------------------------
create or replace function private.return_json(p_return_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'order_id', r.order_id, 'status', r.status, 'reason', r.reason, 'comment', r.comment,
    'resolution', r.resolution,
    'replacement_shipped_at', r.replacement_shipped_at, 'replacement_delivered_at', r.replacement_delivered_at,
    'items_minor', r.items_minor, 'tax_minor', r.tax_minor, 'ship_minor', r.ship_minor, 'protection_minor', r.protection_minor,
    'wrap_minor', r.wrap_minor,
    'refund_minor', r.refund_minor,
    'refund_status', r.refund_status, 'refunded_at', r.refunded_at,
    'dropoff_code', r.dropoff_code, 'dropoff_by', r.dropoff_by, 'reject_note', r.reject_note,
    'created_at', r.created_at, 'received_at', r.received_at, 'rejected_at', r.rejected_at, 'cancelled_at', r.cancelled_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', ri.product_id, 'qty', ri.qty,
               'title', oi.title, 'image', oi.image, 'unit_price_minor', oi.unit_price_minor, 'size', oi.size
             ) order by oi.line_no)
      from public.return_items ri
      join public.order_items oi on oi.order_id = ri.order_id and oi.product_id = ri.product_id
      where ri.return_id = r.id
    ), '[]'::jsonb)
  )
  from public.returns r
  where r.id = p_return_id
$$;
