/*
 * Plus exclusive deals, as Amazon's "Prime exclusive deal": a product can cost Plus members less,
 * a percent off its price (products.member_pct, 1–50). It comes off first, as the member's price,
 * so a coupon, a quantity discount, a promotion and a Bank Offer take their share of what's left;
 * the cart, checkout and Buy Now quotes and the order price it that way for a member (or someone a
 * member shares Plus with) and not for anyone else. Each order line keeps what it took off a unit as
 * unit_member_minor (inside unit_discount_minor), so refunds and cancellations price it as they
 * already do.
 *
 * - private.member_unit_discount(): what a member's price takes off one unit.
 * - The catalog views show member_pct (last).
 * - promo_check(), checkout_json() and place_order() apply it (checkout_json's lines and totals
 *   say how much as member_minor).
 * - A few products in each demo store start with one.
 */

alter table public.products
  add column member_pct integer constraint products_member_pct_check check (member_pct between 1 and 50);

-- admins write it like the other product fields (column grants, admin.sql)
grant insert (member_pct), update (member_pct) on public.products to authenticated;

alter table public.order_items
  add column unit_member_minor integer not null default 0 check (unit_member_minor >= 0);

-- What a Plus member's price takes off one unit (0 for anyone else, or without one).
create function private.member_unit_discount(p_pct integer, p_price integer, p_member boolean)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_member and p_pct is not null then floor(p_price * p_pct / 100.0)::integer else 0 end
$$;

revoke execute on function private.member_unit_discount(integer, integer, boolean) from public, anon, authenticated;

-- the demo stores' Plus exclusive deals: a few of each store's own products, last in id order
-- (tests pick theirs from the front)
update public.products p
   set member_pct = (array[15, 20, 10, 25, 12, 18])[x.n]
  from (
    select q.id, row_number() over (partition by q.market_id order by q.id desc)::integer as n
    from public.products q
    where q.archived_at is null and q.offer_of is null
  ) x
 where x.id = p.id and x.n <= 6;

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
  ) as small_business,
  p.member_pct
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
  unit_qty, unit_kind, qty_discount_pct, qty_discount_min, release_at, subscribe_save, climate, small_business, member_pct
from public.catalog_products_all
where archived_at is null and offer_of is null;

-- ---------------------------------------------------------------------------
-- promo_check (as in 20261210090000_quantity_discounts): a promotion's minimum spend counts what's
-- left after a member's price too.
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
  v_member boolean := private.is_plus_member(p_uid);
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
         coalesce(sum((p.price_minor - md.unit - cd.unit - qd.unit) * l.qty), 0)::integer
    into v_any, v_spend
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, selected boolean)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = p_uid and cc.product_id = l.product_id
  cross join lateral (select private.member_unit_discount(p.member_pct, p.price_minor, v_member) as unit) md
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor - md.unit) as unit) cd
  cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor - md.unit, cd.unit, l.qty) as unit) qd
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
-- checkout_json (as in 20261210090000_quantity_discounts): a member's price comes off first; each
-- line's discount_minor includes it and member_minor says how much, and the totals add
-- member_minor (inside discount_minor).
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
  v_mem   integer;
  v_member boolean := private.is_plus_member(p_uid);
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
      'discount_minor', (md.unit + cd.unit + qd.unit + pd.unit) * l.qty,
      'member_minor', md.unit * l.qty,
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
    coalesce(sum((md.unit + cd.unit + qd.unit + pd.unit) * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(md.unit * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(qd.unit * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(pd.unit * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(pu.unit * l.qty) filter (where coalesce(l.selected, true) and coalesce(l.protection, false)), 0)::integer
  into v_lines, v_count, v_picked, v_sub, v_disc, v_mem, v_qty, v_promo, v_prot
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, n integer, selected boolean, protection boolean, added_price_minor integer, size text)
  join public.catalog_products_all cp on cp.id = l.product_id
  cross join lateral (select private.protection_unit_minor(p_market, cp.category_slug, cp.price_minor) as unit) pu
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = p_uid and cc.product_id = l.product_id
  cross join lateral (select private.member_unit_discount(cp.member_pct, cp.price_minor, v_member) as unit) md
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor - md.unit) as unit) cd
  cross join lateral (select private.qty_unit_discount(cp.qty_discount_pct, cp.qty_discount_min, cp.price_minor - md.unit, cd.unit, l.qty) as unit) qd
  cross join lateral (select private.promo_unit_discount(p_promo, cp.category_slug, cp.price_minor - md.unit, cd.unit + qd.unit) as unit) pd;

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
      'member_minor', v_mem,
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
-- place_order (as in 20270105090000_exchange_offers): a member's price comes off each unit first,
-- and each order line keeps it as unit_member_minor.
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
  p_promo_code text default null,
  -- net banking and EMI: the shopper's bank, for its Bank Offer; ignored for other methods
  p_bank text default null,
  -- card, UPI and net banking: pay what the shopper's balance covers from it, the rest by the method
  p_use_balance boolean default false,
  -- Buy Now of one unit (amazon.in): {device_id, condition}, an old device traded in for money off
  p_exchange jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_member    boolean := private.is_plus_member(auth.uid());
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
  v_day       smallint;
  v_reward    integer;
  v_point     public.pickup_points;
  v_code      text;
  v_ship_fee  integer;
  v_wrap      integer := 0;
  v_wrap_fee  integer;
  v_prot      integer;
  v_total     integer;
  v_balance   integer := 0;
  v_emi       integer := case when p_payment_method = 'emi' then coalesce(p_emi_months, 3) end;
  v_emi_min   integer;
  v_bank      text := case when p_payment_method in ('netbanking', 'emi') then nullif(btrim(coalesce(p_bank, '')), '') end;
  v_offer     public.bank_offers;
  v_bank_raw  integer := 0;
  v_bank_sum  integer := 0;
  v_ex_value  integer;
  v_ex_device text;
  v_exch      integer := 0;
  v_tax       integer;
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
  if char_length(v_bank) > 40 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'bank';
  end if;

  -- Pickup: a pickup point in this store stands in for the address (its name, then its street);
  -- the shopper's name and phone stay, for the pickup notice. Lockers don't take cash.
  if nullif(btrim(coalesce(v_ship ->> 'pickup_point', '')), '') is not null then
    select * into v_point from public.pickup_points pp
     where pp.id = btrim(v_ship ->> 'pickup_point') and pp.market_id = p_market and pp.active;
    if not found then
      raise exception 'pickup_point_not_found' using errcode = 'P0002';
    end if;
    if v_point.kind = 'locker' and p_payment_method = 'cod' then
      raise exception 'pickup_cod_unavailable' using errcode = '22023';
    end if;
    v_line1 := v_point.name;
    v_line2 := v_point.line1;
    v_landmark := null;
    v_city := v_point.city;
    v_state := v_point.state;
    v_postcode := v_point.postcode;
    v_instr := null;
    v_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
  end if;

  if v_name is null or v_phone !~ '^\+?[0-9]{10,15}$' or v_line1 is null or v_city is null
     or v_state is null or (p_market = 'IN' and v_line2 is null) then
    raise exception 'invalid_shipping_address' using errcode = '22023';
  end if;
  if not private.valid_postcode(p_market, v_postcode) then
    raise exception 'invalid_postcode' using errcode = '22023';
  end if;
  -- Delivery Day: a Plus member's chosen weekday, in a store that offers it
  if v_speed = 'day' then
    select pm.delivery_day into v_day
    from public.plus_members pm
    join public.markets m on m.id = p_market and m.delivery_day
    where pm.user_id = v_uid;
  end if;
  -- No-Rush Shipping: later, for a reward to the balance once it ships, in a store that offers it
  if v_speed = 'no_rush' then
    select m.no_rush_reward_minor into v_reward from public.markets m where m.id = p_market;
  end if;
  if not (v_speed = 'standard'
          or (v_speed = 'fast' and private.fast_delivery_offered(p_market, now()))
          or (v_speed = 'day' and v_day is not null)
          or (v_speed = 'no_rush' and v_reward is not null)) then
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

  -- a Plus member's price first, then coupons, then quantity discounts, then the promotion on what's
  -- left of each qualifying unit
  select coalesce(sum(p.price_minor * l.qty), 0)::integer,
         coalesce(sum((md.unit + cd.unit + qd.unit + pd.unit) * l.qty), 0)::integer,
         coalesce(sum(pd.unit * l.qty), 0)::integer
    into v_sub, v_disc, v_promo_sum
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
  cross join lateral (select private.member_unit_discount(p.member_pct, p.price_minor, v_member) as unit) md
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor - md.unit) as unit) cd
  cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor - md.unit, cd.unit, l.qty) as unit) qd
  cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor - md.unit, cd.unit + qd.unit) as unit) pd;
  -- delivery's free threshold goes by what's paid for the items before any Bank Offer
  select * into v_t from public.order_totals(p_market, v_sub - v_disc);
  v_tax := v_t.tax_minor;
  -- the bank's best offer for this method, on what the items come to after the other discounts:
  -- its percentage off each unit, scaled down together when that passes the offer's cap
  if v_bank is not null then
    v_offer := private.bank_offer_for(p_market, p_payment_method, v_bank, v_sub - v_disc);
  end if;
  if v_offer.id is not null then
    with u as (
      select private.bank_unit_discount(v_offer.percent_off, p.price_minor - md.unit - cd.unit - qd.unit - pd.unit, null, null) as raw, l.qty
      from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
      join public.products p on p.id = l.product_id
      left join public.coupons cou on cou.product_id = l.product_id
      left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
      cross join lateral (select private.member_unit_discount(p.member_pct, p.price_minor, v_member) as unit) md
      cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor - md.unit) as unit) cd
      cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor - md.unit, cd.unit, l.qty) as unit) qd
      cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor - md.unit, cd.unit + qd.unit) as unit) pd
    )
    select coalesce(sum(u.raw * u.qty), 0)::integer into v_bank_raw from u;
    with u as (
      select private.bank_unit_discount(v_offer.percent_off, p.price_minor - md.unit - cd.unit - qd.unit - pd.unit, v_offer.max_off_minor, v_bank_raw) as unit, l.qty
      from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
      join public.products p on p.id = l.product_id
      left join public.coupons cou on cou.product_id = l.product_id
      left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
      cross join lateral (select private.member_unit_discount(p.member_pct, p.price_minor, v_member) as unit) md
      cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor - md.unit) as unit) cd
      cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor - md.unit, cd.unit, l.qty) as unit) qd
      cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor - md.unit, cd.unit + qd.unit) as unit) pd
    )
    select coalesce(sum(u.unit * u.qty), 0)::integer into v_bank_sum from u;
    -- tax goes by what's paid
    if v_bank_sum > 0 then
      select t.tax_minor into v_tax from public.order_totals(p_market, v_sub - v_disc - v_bank_sum) t;
    end if;
  end if;
  -- Exchange: an old device traded in comes off the one unit bought, after every other discount
  -- (never more than what's left of it); delivery and EMI still go by the price before it
  if p_exchange is not null then
    if v_from_cart then
      raise exception 'exchange_unavailable' using errcode = 'P0001', detail = 'cart';
    end if;
    if (v_items -> 0 ->> 'qty')::integer <> 1 then
      raise exception 'exchange_unavailable' using errcode = 'P0001', detail = 'qty';
    end if;
    select e.value_minor, e.device into v_ex_value, v_ex_device from private.exchange_value(p_market, v_items -> 0 ->> 'product_id', p_exchange ->> 'device_id', p_exchange ->> 'condition') e;
    v_exch := greatest(least(v_ex_value, v_sub - v_disc - v_bank_sum), 0);
    if v_exch > 0 then
      select t.tax_minor into v_tax from public.order_totals(p_market, v_sub - v_disc - v_bank_sum - v_exch) t;
    end if;
  end if;
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

  v_total := v_sub - v_disc - v_bank_sum - v_exch + v_ship_fee + v_tax + v_wrap + v_prot;
  -- EMI only from the store's minimum order up (before the bank's offer and an exchange, which come off it)
  if v_emi is not null then
    select m.emi_min_minor into v_emi_min from public.markets m where m.id = p_market;
    if v_emi_min is null or v_total + v_bank_sum + v_exch < v_emi_min then
      raise exception 'emi_unavailable' using errcode = '22023';
    end if;
  end if;

  -- rewards from No-Rush orders that have shipped are the shopper's to spend on this one
  if p_payment_method in ('giftcard', 'amazonpay') or coalesce(p_use_balance, false) then
    perform private.credit_no_rush_rewards(v_uid, p_market);
  end if;

  -- part from the balance, the rest by card, UPI or net banking (orders_hold_balance takes it);
  -- a balance that covers the whole order is paid with as the store's balance method instead
  if coalesce(p_use_balance, false) and p_payment_method not in ('giftcard', 'amazonpay') then
    if p_payment_method not in ('card', 'upi', 'netbanking') then
      raise exception 'invalid_input' using errcode = '22023', detail = 'use_balance';
    end if;
    select least(coalesce(max(b.balance_minor), 0), v_total)::integer into v_balance
    from public.store_balances b
    where b.user_id = v_uid and b.market_id = p_market;
    if v_balance > 0 and v_balance >= v_total then
      raise exception 'balance_covers_order' using errcode = 'P0001';
    end if;
  end if;

  v_order_id := private.new_order_id(p_market);
  v_status := case when p_payment_method = 'card' then 'awaiting_payment' else 'placed' end;

  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, discount_minor, ship_minor, tax_minor, wrap_minor, protection_minor, total_minor,
    ship_name, ship_phone, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postcode,
    ship_instructions, gift, gift_message, gift_wrap, ship_speed, delivery_day, from_cart, placed_at, emi_months, promo_code,
    pickup_point_id, pickup_code, bank, bank_offer_id, no_rush_reward_minor, balance_minor, charged_minor,
    exchange_device_id, exchange_device, exchange_condition, exchange_minor
  )
  values (
    v_order_id, v_uid, p_market, (select m.currency from public.markets m where m.id = p_market),
    v_status, p_payment_method,
    case p_payment_method
      when 'card' then 'Card'
      when 'giftcard' then 'Amazon gift card balance'
      when 'upi' then 'UPI'
      when 'netbanking' then 'Net banking' || coalesce(' · ' || v_bank, '')
      when 'cod' then 'Cash on Delivery'
      when 'emi' then 'EMI · ' || v_emi || ' months' || coalesce(' · ' || v_bank, '')
      when 'amazonpay' then 'Amazon Pay balance'
    end,
    v_sub, v_disc + v_bank_sum + v_exch, v_ship_fee, v_tax, v_wrap, v_prot, v_total,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
    v_instr, v_gift, v_note, v_wrap > 0, v_speed, v_day, v_from_cart,
    case when v_status = 'placed' then now() end, v_emi, v_promo ->> 'code',
    v_point.id, v_code, v_bank, case when v_bank_sum > 0 then v_offer.id end, v_reward, v_balance,
    case when v_balance > 0 then v_total - v_balance end,
    case when v_exch > 0 then p_exchange ->> 'device_id' end, case when v_exch > 0 then v_ex_device end,
    case when v_exch > 0 then p_exchange ->> 'condition' end, v_exch
  );

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty, unit_discount_minor, unit_member_minor, unit_qty_discount_minor, unit_promo_minor, unit_bank_minor, unit_exchange_minor, protection_minor, size)
  select v_order_id, l.n, p.id, p.title, p.image, p.seller, p.price_minor, l.qty,
         -- Buy Now's one line takes the exchange, if any
         md.unit + cd.unit + qd.unit + pd.unit + bd.unit + v_exch, md.unit, qd.unit, pd.unit, bd.unit, v_exch,
         case when l.protection then coalesce(private.protection_unit_minor(p_market, p.category_slug, p.price_minor), 0) else 0 end,
         case when p.sizes is not null then l.size end
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer, protection boolean, size text)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
  cross join lateral (select private.member_unit_discount(p.member_pct, p.price_minor, v_member) as unit) md
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor - md.unit) as unit) cd
  cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor - md.unit, cd.unit, l.qty) as unit) qd
  cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor - md.unit, cd.unit + qd.unit) as unit) pd
  cross join lateral (select case when v_bank_sum > 0
    then private.bank_unit_discount(v_offer.percent_off, p.price_minor - md.unit - cd.unit - qd.unit - pd.unit, v_offer.max_off_minor, v_bank_raw)
    else 0 end as unit) bd;

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
