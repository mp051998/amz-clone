/*
 * No-Rush Shipping (amazon.com): at checkout a shopper can choose to have an order come later
 * than standard delivery would, for a reward added to their gift card balance once it ships.
 * It costs what standard delivery does. Only stores with markets.no_rush_reward_minor offer it
 * (the US, $1.00).
 *
 * The order ships 4 days after standard would (orders_fill_schedule; mirrored in
 * lib/decision/tracking.ts) and keeps the reward it was placed with. The reward is credited
 * lazily: settle_no_rush_rewards() — called when the shopper's balance is read — and
 * place_order (before paying from the balance) credit every one of the shopper's No-Rush orders
 * in the store that has shipped and wasn't cancelled, once each (a balance entry of kind
 * 'reward' naming the order). A cancelled order never ships, so it earns nothing.
 */
alter table public.markets
  add column no_rush_reward_minor integer check (no_rush_reward_minor > 0);
update public.markets set no_rush_reward_minor = 100 where id = 'US';

alter table public.orders
  drop constraint orders_ship_speed_check,
  add constraint orders_ship_speed_check check (ship_speed in ('standard', 'fast', 'day', 'no_rush')),
  add column no_rush_reward_minor integer check (no_rush_reward_minor > 0),
  add column reward_credited_at timestamptz,
  add constraint orders_no_rush_reward_check check (no_rush_reward_minor is null or ship_speed = 'no_rush'),
  add constraint orders_reward_credited_check check (reward_credited_at is null or no_rush_reward_minor is not null);

create index orders_no_rush_unrewarded_idx on public.orders (user_id, market_id)
  where no_rush_reward_minor is not null and reward_credited_at is null;

alter table public.balance_entries drop constraint balance_entries_kind_check;
alter table public.balance_entries
  add constraint balance_entries_kind_check check (kind in ('gift_card', 'order', 'refund', 'reload', 'reward'));
-- an order's reward is paid once
create unique index balance_entries_reward_idx on public.balance_entries (order_id) where kind = 'reward';

-- Credit the shopper's shipped No-Rush rewards in a store to their balance; returns the amount credited.
-- Marking the order first means concurrent calls can't both pay it (the second skips it).
create function private.credit_no_rush_rewards(p_user uuid, p_market text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_sum   integer := 0;
begin
  for v_order in
    update public.orders o
       set reward_credited_at = now()
     where o.user_id = p_user and o.market_id = p_market
       and o.no_rush_reward_minor is not null and o.reward_credited_at is null
       and o.status = 'placed' and o.shipped_at <= now()
    returning o.id, o.no_rush_reward_minor
  loop
    perform private.move_balance(p_user, p_market, v_order.no_rush_reward_minor, 'reward', null, v_order.id);
    v_sum := v_sum + v_order.no_rush_reward_minor;
  end loop;
  return v_sum;
end
$$;

revoke execute on function private.credit_no_rush_rewards(uuid, text) from public, anon, authenticated;

-- The caller's shipped No-Rush rewards in a store, credited to their balance now; returns the amount.
create function public.settle_no_rush_rewards(p_market text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return private.credit_no_rush_rewards(auth.uid(), p_market);
end
$$;

revoke execute on function public.settle_no_rush_rewards(text) from public, anon;
grant execute on function public.settle_no_rush_rewards(text) to authenticated, service_role;

-- The schedule filled on placement: No-Rush ships 4 days after standard would.
create or replace function public.orders_fill_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz   text;
  v_from timestamptz;
  v_d    record;
begin
  if new.status = 'placed' and new.placed_at is not null and new.shipped_at is null then
    select m.time_zone into v_tz from public.markets m where m.id = new.market_id;
    v_tz := coalesce(v_tz, 'UTC');
    v_from := greatest(new.placed_at, coalesce(new.release_at, new.placed_at));
    if new.ship_speed = 'fast' then
      new.shipped_at := v_from + interval '3 hours';
      select * into v_d from private.fast_delivery_after(new.shipped_at, v_tz);
    elsif new.ship_speed = 'day' then
      select * into v_d from private.delivery_day_after(v_from, new.delivery_day, v_tz);
      new.shipped_at := v_d.shipped;
    elsif new.ship_speed = 'no_rush' then
      -- standard's 10 hours to ship, 4 days later
      new.shipped_at := v_from + interval '106 hours';
      select * into v_d from private.delivery_after(new.shipped_at, v_tz);
    else
      new.shipped_at := v_from + interval '10 hours';
      select * into v_d from private.delivery_after(new.shipped_at, v_tz);
    end if;
    new.out_for_delivery_at := v_d.out_for_delivery;
    new.delivered_at := v_d.delivered;
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- place_order (as in 20261226090000_bank_offers): 'no_rush' where the store offers it, keeping
-- the store's reward on the order; paying from the balance spends shipped rewards too.
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
  p_bank text default null
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
  v_emi       integer := case when p_payment_method = 'emi' then coalesce(p_emi_months, 3) end;
  v_emi_min   integer;
  v_bank      text := case when p_payment_method in ('netbanking', 'emi') then nullif(btrim(coalesce(p_bank, '')), '') end;
  v_offer     public.bank_offers;
  v_bank_raw  integer := 0;
  v_bank_sum  integer := 0;
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

  v_total := v_sub - v_disc - v_bank_sum + v_ship_fee + v_tax + v_wrap + v_prot;
  -- EMI only from the store's minimum order up (before the bank's offer, which comes off it)
  if v_emi is not null then
    select m.emi_min_minor into v_emi_min from public.markets m where m.id = p_market;
    if v_emi_min is null or v_total + v_bank_sum < v_emi_min then
      raise exception 'emi_unavailable' using errcode = '22023';
    end if;
  end if;

  -- rewards from No-Rush orders that have shipped are the shopper's to spend on this one
  if p_payment_method in ('giftcard', 'amazonpay') then
    perform private.credit_no_rush_rewards(v_uid, p_market);
  end if;

  v_order_id := private.new_order_id(p_market);
  v_status := case when p_payment_method = 'card' then 'awaiting_payment' else 'placed' end;

  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, discount_minor, ship_minor, tax_minor, wrap_minor, protection_minor, total_minor,
    ship_name, ship_phone, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postcode,
    ship_instructions, gift, gift_message, gift_wrap, ship_speed, delivery_day, from_cart, placed_at, emi_months, promo_code,
    pickup_point_id, pickup_code, bank, bank_offer_id, no_rush_reward_minor
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
    v_sub, v_disc + v_bank_sum, v_ship_fee, v_tax, v_wrap, v_prot, v_total,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
    v_instr, v_gift, v_note, v_wrap > 0, v_speed, v_day, v_from_cart,
    case when v_status = 'placed' then now() end, v_emi, v_promo ->> 'code',
    v_point.id, v_code, v_bank, case when v_bank_sum > 0 then v_offer.id end, v_reward
  );

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty, unit_discount_minor, unit_qty_discount_minor, unit_promo_minor, unit_bank_minor, protection_minor, size)
  select v_order_id, l.n, p.id, p.title, p.image, p.seller, p.price_minor, l.qty,
         cd.unit + qd.unit + pd.unit + bd.unit, qd.unit, pd.unit, bd.unit,
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
