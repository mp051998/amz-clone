-- Pickup points, as Amazon Hub Locker and Hub Counter: instead of an address, a shopper can have an
-- order delivered to a locker or a staffed counter in the store and collect it there with a
-- six-digit pickup code. Delivery runs on the usual schedule; "delivered" means ready for pickup,
-- and the point holds it for its hold days. Lockers are open around the clock and don't take cash
-- (pickup_cod_unavailable); counters keep shop hours.
-- ---------------------------------------------------------------------------

create table public.pickup_points (
  id          text primary key,
  market_id   text not null references public.markets (id),
  kind        text not null check (kind in ('locker', 'counter')),
  name        text not null,
  line1       text not null,
  city        text not null,
  state       text not null,
  postcode    text not null,
  hours       text not null,
  -- how long it keeps a parcel for collection
  hold_days   smallint not null check (hold_days between 1 and 30),
  active      boolean not null default true,
  check (private.valid_postcode(market_id, postcode))
);
create index pickup_points_market_idx on public.pickup_points (market_id, city);

alter table public.pickup_points enable row level security;
-- anyone can see where they could collect (orders keep pointing at a point taken out of service)
create policy pickup_points_read on public.pickup_points for select to anon, authenticated using (true);
grant select on public.pickup_points to anon, authenticated;

insert into public.pickup_points (id, market_id, kind, name, line1, city, state, postcode, hours, hold_days) values
  ('US-SEA-JUNIPER',   'US', 'locker',  'Hub Locker – Juniper',          '2121 7th Ave',                  'Seattle',       'WA',             '98121',  'Open 24 hours',                        3),
  ('US-SEA-BROADWAY',  'US', 'counter', 'Hub Counter – Broadway Market', '401 Broadway E',                'Seattle',       'WA',             '98102',  'Mon–Sat 8 AM–9 PM, Sun 10 AM–6 PM',     14),
  ('US-NYC-HUDSON',    'US', 'locker',  'Hub Locker – Hudson',           '225 W 34th St',                 'New York',      'NY',             '10122',  'Open 24 hours',                        3),
  ('US-SFO-MISSION',   'US', 'locker',  'Hub Locker – Mission',          '2675 Geary Blvd',               'San Francisco', 'CA',             '94118',  'Open 24 hours',                        3),
  ('US-LAX-SUNSET',    'US', 'counter', 'Hub Counter – Sunset',          '6801 Hollywood Blvd',           'Los Angeles',   'CA',             '90028',  'Daily 9 AM–10 PM',                     14),
  ('US-AUS-BLUEBONNET','US', 'locker',  'Hub Locker – Bluebonnet',       '1000 E 41st St',                'Austin',        'TX',             '78751',  'Open 24 hours',                        3),
  ('US-CHI-LAKEVIEW',  'US', 'locker',  'Hub Locker – Lakeview',         '3300 N Broadway',               'Chicago',       'IL',             '60657',  'Open 24 hours',                        3),
  ('US-BOS-BACKBAY',   'US', 'counter', 'Hub Counter – Back Bay',        '800 Boylston St',               'Boston',        'MA',             '02199',  'Mon–Sat 10 AM–8 PM, Sun 11 AM–6 PM',    14),
  ('IN-BLR-KORAMANGALA','IN','locker',  'Hub Locker – Koramangala',      '80 Feet Road, 6th Block',       'Bengaluru',     'Karnataka',      '560095', 'Open 24 hours',                        3),
  ('IN-BLR-INDIRANAGAR','IN','counter', 'Hub Counter – Indiranagar',     '100 Feet Road, HAL 2nd Stage',  'Bengaluru',     'Karnataka',      '560038', 'Mon–Sat 9 AM–9 PM',                    7),
  ('IN-BOM-ANDHERI',   'IN', 'locker',  'Hub Locker – Andheri',          'Veera Desai Road, Andheri West', 'Mumbai',       'Maharashtra',    '400053', 'Open 24 hours',                        3),
  ('IN-DEL-CP',        'IN', 'counter', 'Hub Counter – Connaught Place', 'Block N, Connaught Place',      'New Delhi',     'Delhi',          '110001', 'Daily 10 AM–9 PM',                     7),
  ('IN-HYD-GACHIBOWLI','IN', 'locker',  'Hub Locker – Gachibowli',       'Old Mumbai Highway, Gachibowli', 'Hyderabad',    'Telangana',      '500032', 'Open 24 hours',                        3),
  ('IN-MAA-TNAGAR',    'IN', 'counter', 'Hub Counter – T. Nagar',        'Usman Road, T. Nagar',          'Chennai',       'Tamil Nadu',     '600017', 'Mon–Sat 10 AM–8 PM',                   7),
  ('IN-PNQ-KOTHRUD',   'IN', 'locker',  'Hub Locker – Kothrud',          'Paud Road, Kothrud',            'Pune',          'Maharashtra',    '411038', 'Open 24 hours',                        3),
  ('IN-CCU-SALTLAKE',  'IN', 'counter', 'Hub Counter – Salt Lake',       'Sector V, Salt Lake',           'Kolkata',       'West Bengal',    '700091', 'Mon–Sat 9 AM–8 PM',                    7);

-- a pickup order: where it goes and the code that opens the locker (or that the counter asks for)
alter table public.orders
  add column pickup_point_id text references public.pickup_points (id),
  add column pickup_code text check (pickup_code ~ '^[0-9]{6}$'),
  add constraint orders_pickup_code_check check ((pickup_point_id is null) = (pickup_code is null));

-- ---------------------------------------------------------------------------
-- set_my_order_address (as in 20261101090000_order_address): sending a pickup order to an address
-- in the address book ends the pickup.
-- ---------------------------------------------------------------------------
create or replace function public.set_my_order_address(p_order_id text, p_address_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_addr  public.addresses;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.user_id = auth.uid() for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at) <> 'preparing' then
    raise exception 'order_address_locked' using errcode = 'P0001';
  end if;
  select * into v_addr from public.addresses a
   where a.id = p_address_id and a.user_id = auth.uid() and a.market_id = v_order.market_id;
  if not found then raise exception 'address_not_found' using errcode = 'P0002'; end if;

  update public.orders o
     set ship_name = v_addr.full_name,
         ship_phone = v_addr.phone,
         ship_line1 = v_addr.line1,
         ship_line2 = v_addr.line2,
         ship_landmark = v_addr.landmark,
         ship_city = v_addr.city,
         ship_state = v_addr.state,
         ship_postcode = v_addr.postcode,
         ship_instructions = v_addr.instructions,
         pickup_point_id = null,
         pickup_code = null
   where o.id = p_order_id;
  return private.order_json(p_order_id);
end $$;

-- ---------------------------------------------------------------------------
-- set_my_order_instructions (as in 20261027090000_order_instructions): a pickup order has no
-- courier to instruct.
-- ---------------------------------------------------------------------------
create or replace function public.set_my_order_instructions(p_order_id text, p_instructions text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_instr text := nullif(btrim(replace(replace(coalesce(p_instructions, ''), E'\r\n', E'\n'), E'\r', E'\n')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if char_length(v_instr) > 250 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'instructions';
  end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.user_id = auth.uid() for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.pickup_point_id is not null
     or private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at)
        not in ('preparing', 'shipped') then
    raise exception 'order_not_editable' using errcode = 'P0001';
  end if;
  update public.orders o set ship_instructions = v_instr where o.id = p_order_id;
  return private.order_json(p_order_id);
end $$;

-- ---------------------------------------------------------------------------
-- place_order (as in 20261211090000_delivery_day) takes p_shipping.pickup_point: an active
-- pickup point in the store, whose address the order ships to, with a pickup code.
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
  v_day       smallint;
  v_point     public.pickup_points;
  v_code      text;
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
  if not (v_speed = 'standard'
          or (v_speed = 'fast' and private.fast_delivery_offered(p_market, now()))
          or (v_speed = 'day' and v_day is not null)) then
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
    ship_instructions, gift, gift_message, gift_wrap, ship_speed, delivery_day, from_cart, placed_at, emi_months, promo_code,
    pickup_point_id, pickup_code
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
    v_instr, v_gift, v_note, v_wrap > 0, v_speed, v_day, v_from_cart,
    case when v_status = 'placed' then now() end, v_emi, v_promo ->> 'code',
    v_point.id, v_code
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
