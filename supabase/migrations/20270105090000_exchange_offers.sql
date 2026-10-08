/*
 * Exchange offers, as on amazon.in ("With Exchange: Up to ₹X off" on phones and laptops): buying
 * one unit with Buy Now, the shopper trades in an old device of the same kind, picked from the
 * store's list of models, and says what state it's in. Its value comes off the new one, and the
 * old one is collected when the order is delivered.
 *
 * - market_categories.exchange_kind ('phone' | 'laptop'): admins set which of a store's
 *   categories take an exchange, and of what (amazon.in only).
 * - exchange_devices: the models taken in, by store and kind, each with what it's worth working
 *   with an undamaged screen; one that works with a damaged screen is worth half. Anyone reads them.
 * - A device's value is capped at half the new item's price (private.exchange_value, mirrored in
 *   lib/exchange.ts), and comes off after every other discount (never more than what's left).
 * - place_order(..., p_exchange {device_id, condition}): Buy Now of one unit only
 *   (exchange_unavailable, detail cart | qty | product | device). The line's
 *   order_items.unit_exchange_minor is part of its unit_discount_minor, so a cancelled or returned
 *   item refunds what was paid; the order keeps the device (exchange_device_id and its name as
 *   ordered), its condition and the value (exchange_minor). Free delivery and EMI's minimum go by
 *   the price before it.
 * - exchange_quote(): what a device would take off a product, for the product page and checkout.
 */

alter table public.market_categories
  add column exchange_kind text check (exchange_kind in ('phone', 'laptop')),
  add constraint market_categories_exchange_market check (exchange_kind is null or market_id = 'IN');

grant update (exchange_kind) on public.market_categories to authenticated;

-- amazon.in: phones and laptops. A fresh database gets its categories from the seed, after this,
-- without one.
update public.market_categories set exchange_kind = case category_slug when 'mobiles' then 'phone' else 'laptop' end
where market_id = 'IN' and category_slug in ('mobiles', 'computers');

create table public.exchange_devices (
  id          text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  market_id   text not null references public.markets (id),
  kind        text not null check (kind in ('phone', 'laptop')),
  brand       text not null check (char_length(brand) between 1 and 40),
  model       text not null check (char_length(model) between 1 and 80),
  -- working, screen undamaged
  value_minor integer not null check (value_minor > 0),
  active      boolean not null default true,
  unique (market_id, kind, brand, model)
);

alter table public.exchange_devices enable row level security;

-- the list is public, like the store's prices; only the store writes it
create policy "exchange devices: read" on public.exchange_devices
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.exchange_devices from anon, authenticated;

insert into public.exchange_devices (id, market_id, kind, brand, model, value_minor) values
  ('apple-iphone-14',          'IN', 'phone',  'Apple',    'iPhone 14',                 2600000),
  ('apple-iphone-13',          'IN', 'phone',  'Apple',    'iPhone 13',                 2100000),
  ('apple-iphone-12',          'IN', 'phone',  'Apple',    'iPhone 12',                 1550000),
  ('apple-iphone-11',          'IN', 'phone',  'Apple',    'iPhone 11',                 1100000),
  ('samsung-galaxy-s23',       'IN', 'phone',  'Samsung',  'Galaxy S23',                2400000),
  ('samsung-galaxy-s21-fe',    'IN', 'phone',  'Samsung',  'Galaxy S21 FE',             1150000),
  ('samsung-galaxy-m34',       'IN', 'phone',  'Samsung',  'Galaxy M34 5G',              650000),
  ('samsung-galaxy-a14',       'IN', 'phone',  'Samsung',  'Galaxy A14',                 420000),
  ('oneplus-11r',              'IN', 'phone',  'OnePlus',  '11R',                       1400000),
  ('oneplus-nord-ce-3',        'IN', 'phone',  'OnePlus',  'Nord CE 3',                  780000),
  ('xiaomi-redmi-note-12',     'IN', 'phone',  'Xiaomi',   'Redmi Note 12',              520000),
  ('realme-narzo-60',          'IN', 'phone',  'realme',   'Narzo 60',                   480000),
  ('vivo-y56',                 'IN', 'phone',  'vivo',     'Y56 5G',                     440000),
  ('oppo-a78',                 'IN', 'phone',  'OPPO',     'A78 5G',                     460000),
  ('motorola-g54',             'IN', 'phone',  'Motorola', 'Moto G54 5G',                490000),
  ('apple-macbook-air-m1',     'IN', 'laptop', 'Apple',    'MacBook Air (M1, 2020)',    3200000),
  ('dell-inspiron-15-3520',    'IN', 'laptop', 'Dell',     'Inspiron 15 3520',          1400000),
  ('hp-15s-i5',                'IN', 'laptop', 'HP',       '15s (Intel Core i5)',       1300000),
  ('lenovo-ideapad-slim-3',    'IN', 'laptop', 'Lenovo',   'IdeaPad Slim 3',            1250000),
  ('asus-vivobook-15',         'IN', 'laptop', 'ASUS',     'Vivobook 15',               1100000),
  ('acer-aspire-7',            'IN', 'laptop', 'Acer',     'Aspire 7',                  1500000);

alter table public.order_items
  add column unit_exchange_minor integer not null default 0 check (unit_exchange_minor >= 0);

alter table public.orders
  add column exchange_device_id text references public.exchange_devices (id) on delete set null,
  -- the device as it was named when ordered
  add column exchange_device    text,
  add column exchange_condition text check (exchange_condition in ('good', 'screen_damaged')),
  add column exchange_minor     integer not null default 0 check (exchange_minor >= 0),
  add constraint orders_exchange_check check ((exchange_minor > 0) = (exchange_device is not null) and (exchange_device is null) = (exchange_condition is null));

-- What `p_device` in `p_condition` takes off one unit of `p_product` before other discounts are
-- counted: its value (half with a damaged screen), up to half the product's price. Mirrored in
-- lib/exchange.ts. product_not_found; exchange_unavailable (product: its category takes no
-- exchange; device: not one this store takes for it); invalid_input (exchange: the condition).
create function private.exchange_value(p_market text, p_product text, p_device text, p_condition text, out value_minor integer, out device text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_price integer;
  v_kind  text;
  v_dev   public.exchange_devices;
begin
  select p.price_minor, mc.exchange_kind into v_price, v_kind
  from public.products p
  left join public.market_categories mc on mc.market_id = p.market_id and mc.category_slug = p.category_slug
  where p.id = p_product and p.market_id = p_market;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if v_kind is null then
    raise exception 'exchange_unavailable' using errcode = 'P0001', detail = 'product';
  end if;
  if coalesce(p_condition, '') not in ('good', 'screen_damaged') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'exchange';
  end if;
  select * into v_dev from public.exchange_devices d
  where d.id = p_device and d.market_id = p_market and d.kind = v_kind and d.active;
  if not found then
    raise exception 'exchange_unavailable' using errcode = 'P0001', detail = 'device';
  end if;
  value_minor := least(case p_condition when 'good' then v_dev.value_minor else v_dev.value_minor / 2 end, v_price / 2);
  device := v_dev.brand || ' ' || v_dev.model;
end
$$;

revoke execute on function private.exchange_value(text, text, text, text) from public, anon, authenticated;

-- {value_minor, device}: what trading the device in would take off the product (see above).
create function public.exchange_quote(p_market text, p_product text, p_device text, p_condition text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('value_minor', e.value_minor, 'device', e.device)
  from private.exchange_value(p_market, p_product, p_device, p_condition) e
$$;

revoke execute on function public.exchange_quote(text, text, text, text) from public;
grant execute on function public.exchange_quote(text, text, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- place_order (as in 20270104090000_split_payment) with p_exchange.
-- ---------------------------------------------------------------------------
drop function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean, integer, text, text, boolean);

create function public.place_order(
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
      select private.bank_unit_discount(v_offer.percent_off, p.price_minor - cd.unit - qd.unit - pd.unit, null, null) as raw, l.qty
      from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
      join public.products p on p.id = l.product_id
      left join public.coupons cou on cou.product_id = l.product_id
      left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
      cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor) as unit) cd
      cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor, cd.unit, l.qty) as unit) qd
      cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor, cd.unit + qd.unit) as unit) pd
    )
    select coalesce(sum(u.raw * u.qty), 0)::integer into v_bank_raw from u;
    with u as (
      select private.bank_unit_discount(v_offer.percent_off, p.price_minor - cd.unit - qd.unit - pd.unit, v_offer.max_off_minor, v_bank_raw) as unit, l.qty
      from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
      join public.products p on p.id = l.product_id
      left join public.coupons cou on cou.product_id = l.product_id
      left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
      cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor) as unit) cd
      cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor, cd.unit, l.qty) as unit) qd
      cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor, cd.unit + qd.unit) as unit) pd
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

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty, unit_discount_minor, unit_qty_discount_minor, unit_promo_minor, unit_bank_minor, unit_exchange_minor, protection_minor, size)
  select v_order_id, l.n, p.id, p.title, p.image, p.seller, p.price_minor, l.qty,
         -- Buy Now's one line takes the exchange, if any
         cd.unit + qd.unit + pd.unit + bd.unit + v_exch, qd.unit, pd.unit, bd.unit, v_exch,
         case when l.protection then coalesce(private.protection_unit_minor(p_market, p.category_slug, p.price_minor), 0) else 0 end,
         case when p.sizes is not null then l.size end
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer, protection boolean, size text)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id
  cross join lateral (select private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor) as unit) cd
  cross join lateral (select private.qty_unit_discount(p.qty_discount_pct, p.qty_discount_min, p.price_minor, cd.unit, l.qty) as unit) qd
  cross join lateral (select private.promo_unit_discount(v_promo, p.category_slug, p.price_minor, cd.unit + qd.unit) as unit) pd
  cross join lateral (select case when v_bank_sum > 0
    then private.bank_unit_discount(v_offer.percent_off, p.price_minor - cd.unit - qd.unit - pd.unit, v_offer.max_off_minor, v_bank_raw)
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

revoke execute on function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean, integer, text, text, boolean, jsonb) from public, anon;
grant execute on function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean, integer, text, text, boolean, jsonb) to authenticated, service_role;
