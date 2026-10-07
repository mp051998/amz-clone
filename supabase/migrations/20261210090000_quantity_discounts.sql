-- Quantity discounts, as Amazon's "Save 5% when you buy 2 or more": a product can take a percent
-- off each unit when a line holds at least so many (qty_discount_pct, qty_discount_min; both or
-- neither). It applies after the product's coupon and before a promotion code, in the cart,
-- checkout and Buy Now quotes and the order; each order line keeps what it took off a unit as
-- unit_qty_discount_minor (inside unit_discount_minor, like unit_promo_minor), so refunds and
-- cancellations price it as they already do. A promotion's minimum spend counts what's left.

alter table public.products
  add column qty_discount_pct integer constraint products_qty_discount_pct_check check (qty_discount_pct between 1 and 50),
  add column qty_discount_min integer constraint products_qty_discount_min_check check (qty_discount_min between 2 and 99),
  add constraint products_qty_discount_check check ((qty_discount_pct is null) = (qty_discount_min is null));

-- admins write them like the other product fields (column grants, admin.sql)
grant insert (qty_discount_pct, qty_discount_min), update (qty_discount_pct, qty_discount_min) on public.products to authenticated;

alter table public.order_items
  add column unit_qty_discount_minor integer not null default 0 check (unit_qty_discount_minor >= 0);

-- What buying p_qty or more takes off one unit, after its coupon (0 below the minimum or without one).
create function private.qty_unit_discount(p_percent integer, p_min integer, p_price integer, p_coupon integer, p_qty integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_percent is not null and p_qty >= p_min then floor((p_price - p_coupon) * p_percent / 100.0)::integer
    else 0
  end
$$;

revoke execute on function private.qty_unit_discount(integer, integer, integer, integer, integer) from public, anon, authenticated;

-- The catalog views (as in 20261209090000_unit_price) gain the quantity discount, last.

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
  p.qty_discount_min
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
  unit_qty, unit_kind, qty_discount_pct, qty_discount_min
from public.catalog_products_all
where archived_at is null;

-- ---------------------------------------------------------------------------
-- promo_check (as in 20261123090000_promo_codes): the minimum spend counts what's left after
-- coupons and quantity discounts.
-- ---------------------------------------------------------------------------
create or replace function private.promo_check(p_market text, p_uid uuid, p_code text, p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p     public.promo_codes;
  v_any   boolean;
  v_spend integer;
begin
  select * into v_p from public.promo_codes pc
  where pc.market_id = p_market and pc.code = upper(btrim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('error', 'promo_invalid');
  end if;
  if v_p.starts_at > now() or (v_p.ends_at is not null and v_p.ends_at <= now()) then
    return jsonb_build_object('error', 'promo_expired');
  end if;
  if (select count(*) from public.orders o
      where o.user_id = p_uid and o.market_id = p_market and o.promo_code = v_p.code and o.status <> 'cancelled') >= v_p.uses_per_customer then
    return jsonb_build_object('error', 'promo_used');
  end if;

  select count(*) > 0,
         coalesce(sum((p.price_minor - cd.unit - qd.unit) * l.qty), 0)::integer
    into v_any, v_spend
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, selected boolean)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = p_uid and cc.product_id = l.product_id
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor) as unit) cd
  cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor, cd.unit, l.qty) as unit) qd
  where coalesce(l.selected, true) and (v_p.category_slug is null or p.category_slug = v_p.category_slug);
  if not v_any then
    return jsonb_build_object('error', 'promo_not_eligible');
  end if;
  if v_spend < v_p.min_spend_minor then
    return jsonb_build_object('error', 'promo_min_spend', 'detail', v_p.min_spend_minor::text);
  end if;

  return jsonb_build_object('code', v_p.code, 'percent_off', v_p.percent_off, 'category_slug', v_p.category_slug, 'description', v_p.description);
end
$$;

-- ---------------------------------------------------------------------------
-- checkout_json (as in 20261201090000_sizes): each line's discount_minor includes its quantity
-- discount and qty_discount_minor says how much; the totals add qty_discount_minor (inside
-- discount_minor).
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
  v_qty   integer;
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
      'discount_minor', (cd.unit + qd.unit + pd.unit) * l.qty,
      'qty_discount_minor', qd.unit * l.qty,
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
    coalesce(sum((cd.unit + qd.unit + pd.unit) * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(qd.unit * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(pd.unit * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(pu.unit * l.qty) filter (where coalesce(l.selected, true) and coalesce(l.protection, false)), 0)::integer
  into v_lines, v_count, v_picked, v_sub, v_disc, v_qty, v_promo, v_prot
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, n integer, selected boolean, protection boolean, added_price_minor integer, size text)
  join public.catalog_products_all cp on cp.id = l.product_id
  cross join lateral (select private.protection_unit_minor(p_market, cp.category_slug, cp.price_minor) as unit) pu
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = p_uid and cc.product_id = l.product_id
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor) as unit) cd
  cross join lateral (select private.qty_unit_discount(cp.qty_discount_pct, cp.qty_discount_min, cp.price_minor, cd.unit, l.qty) as unit) qd
  cross join lateral (select private.promo_unit_discount(p_promo, cp.category_slug, cp.price_minor, cd.unit + qd.unit) as unit) pd;

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
      'qty_discount_minor', v_qty,
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
-- place_order (as in 20261201090000_sizes): quantity discounts come off after coupons and before
-- the promotion, and each order line keeps its unit_qty_discount_minor.
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

  -- coupons first, then quantity discounts, then the promotion on what's left of each qualifying unit
  select coalesce(sum(p.price_minor * l.qty), 0)::integer,
         coalesce(sum((cd.unit + qd.unit + pd.unit) * l.qty), 0)::integer,
         coalesce(sum(pd.unit * l.qty), 0)::integer
    into v_sub, v_disc, v_promo_sum
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor) as unit) cd
  cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor, cd.unit, l.qty) as unit) qd
  cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor, cd.unit + qd.unit) as unit) pd;
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

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty, unit_discount_minor, unit_qty_discount_minor, unit_promo_minor, protection_minor, size)
  select v_order_id, l.n, p.id, p.title, p.image, p.seller, p.price_minor, l.qty,
         cd.unit + qd.unit + pd.unit, qd.unit, pd.unit,
         case when l.protection then coalesce(private.protection_unit_minor(p_market, p.category_slug, p.price_minor), 0) else 0 end,
         case when p.sizes is not null then l.size end
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer, protection boolean, size text)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor) as unit) cd
  cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor, cd.unit, l.qty) as unit) qd
  cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor, cd.unit + qd.unit) as unit) pd;

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
