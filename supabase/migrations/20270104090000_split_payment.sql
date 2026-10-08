/*
 * Split payment (amazon.com, amazon.in): at checkout a shopper whose gift card / Amazon Pay
 * balance doesn't cover the order can tick "Use your balance" and pay the rest by card, UPI or
 * net banking. (A balance that covers it all is paid with as the balance method, as before; cash
 * on delivery and EMI don't combine with it.)
 *
 * - orders.balance_minor: what the balance paid (0 for every other order, including balance-method
 *   ones, which pay total_minor from it), and orders.charged_minor: what the payment method paid,
 *   the rest of the total as placed (null unless balance_minor is set; cancelling items lowers
 *   total_minor but not these). place_order(..., p_use_balance) takes the lesser of the balance and
 *   the total, and orders_hold_balance takes it from the balance as the order is inserted. A card
 *   order's Stripe Checkout asks for charged_minor only (confirm_order_payment checks it).
 * - An unpaid card order that's abandoned, lapses or is cancelled gives its balance part back
 *   (orders_release_balance); if its payment lands after all and it's revived, the part is taken
 *   again, or it stays cancelled and is refunded (balance_spent) when the balance has been spent.
 * - Refunds of a split order (a cancelled order, cancelled items, a return refunded to how they
 *   paid) go back to the other method first, up to what it paid, and the rest to the balance:
 *   balance_refund_minor on orders, order_cancellations and returns is that part, credited as the
 *   refund is recorded. The card is refunded refund_minor - balance_refund_minor; a refund that
 *   is all balance needs nothing from Stripe and is marked succeeded at once.
 */

alter table public.orders
  add column balance_minor integer not null default 0 check (balance_minor >= 0),
  add column charged_minor integer check (charged_minor > 0),
  add column balance_refund_minor integer not null default 0 check (balance_refund_minor >= 0),
  add constraint orders_balance_charged check ((balance_minor > 0) = (charged_minor is not null)),
  add constraint orders_balance_split_method check (balance_minor = 0 or payment_method in ('card', 'upi', 'netbanking'));
alter table public.order_cancellations
  add column balance_refund_minor integer not null default 0 check (balance_refund_minor >= 0);
alter table public.returns
  add column balance_refund_minor integer not null default 0 check (balance_refund_minor >= 0);

-- Take a split order's balance part as it's placed (or reserved, for a card order awaiting payment).
create function private.orders_hold_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.move_balance(new.user_id, new.market_id, -new.balance_minor, 'order', null, new.id);
  return null;
end
$$;

create trigger orders_hold_balance
  after insert on public.orders
  for each row
  when (new.balance_minor > 0)
  execute function private.orders_hold_balance();

-- An unpaid card order that's cancelled (abandoned for a newer checkout, its Stripe page lapsed or
-- left) gives its balance part back.
create function private.orders_release_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.move_balance(new.user_id, new.market_id, new.balance_minor, 'refund', null, new.id);
  return null;
end
$$;

create trigger orders_release_balance
  after update of status on public.orders
  for each row
  when (old.status = 'awaiting_payment' and new.status = 'cancelled' and new.balance_minor > 0)
  execute function private.orders_release_balance();

-- How much of a refund on an order goes to the balance: the other method gets back what it paid
-- first. Call it once the refund is recorded with balance_refund_minor still 0 (it's counted as
-- going wholly to the other method until then). Locks the order, so refunds are split one at a time.
create function private.balance_refund_share(p_order_id text, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_back  integer;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.balance_minor = 0 or coalesce(p_amount, 0) <= 0 then
    return 0;
  end if;
  select coalesce(case when v_order.refund_status in ('pending', 'succeeded', 'failed')
                       then coalesce(v_order.refund_minor, v_order.total_minor) - v_order.balance_refund_minor end, 0)
       + coalesce((select sum(c.refund_minor - c.balance_refund_minor) from public.order_cancellations c
                    where c.order_id = p_order_id and c.refund_status in ('pending', 'succeeded', 'failed')), 0)
       + coalesce((select sum(r.refund_minor - r.balance_refund_minor) from public.returns r
                    where r.order_id = p_order_id and r.refund_to = 'original'
                      and r.refund_status in ('pending', 'succeeded', 'failed')), 0)
    into v_back;
  return least(p_amount, greatest(v_back - v_order.charged_minor, 0));
end
$$;

-- A cancelled split order's refund. One that was never placed (paid after it was abandoned, and
-- sold out meanwhile) already had its balance part back, so only the card is owed.
create function private.orders_split_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount integer := coalesce(new.refund_minor, new.total_minor);
  v_bal    integer;
begin
  if new.placed_at is null then
    update public.orders o
       set refund_minor = least(v_amount, o.charged_minor)
     where o.id = new.id;
    return null;
  end if;
  v_bal := private.balance_refund_share(new.id, v_amount);
  if v_bal > 0 then
    update public.orders o
       set balance_refund_minor = v_bal,
           refund_status = case when v_bal = v_amount then 'succeeded' else o.refund_status end,
           refunded_at = case when v_bal = v_amount then coalesce(o.refunded_at, now()) else o.refunded_at end
     where o.id = new.id;
    perform private.move_balance(new.user_id, new.market_id, v_bal, 'refund', null, new.id);
  end if;
  return null;
end
$$;

create trigger orders_split_refund
  after update of refund_status on public.orders
  for each row
  when (old.refund_status is null and new.refund_status in ('pending', 'succeeded') and new.balance_minor > 0)
  execute function private.orders_split_refund();

-- Cancelled items of a split order.
create function private.cancellations_split_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bal integer := private.balance_refund_share(new.order_id, new.refund_minor);
begin
  if v_bal > 0 then
    update public.order_cancellations c
       set balance_refund_minor = v_bal,
           refund_status = case when v_bal = c.refund_minor then 'succeeded' else c.refund_status end,
           refunded_at = case when v_bal = c.refund_minor then coalesce(c.refunded_at, now()) else c.refunded_at end
     where c.id = new.id;
    perform private.move_balance(o.user_id, o.market_id, v_bal, 'refund', null, o.id)
    from public.orders o where o.id = new.order_id;
  end if;
  return null;
end
$$;

create trigger order_cancellations_split_refund
  after insert on public.order_cancellations
  for each row
  when (new.refund_status in ('pending', 'succeeded'))
  execute function private.cancellations_split_refund();

-- A received return of a split order refunded to how they paid (one refunded to the balance is
-- all balance already: returns_refund_balance).
create function private.returns_split_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bal integer := private.balance_refund_share(new.order_id, new.refund_minor);
begin
  if v_bal > 0 then
    update public.returns r
       set balance_refund_minor = v_bal,
           refund_status = case when v_bal = r.refund_minor then 'succeeded' else r.refund_status end,
           refunded_at = case when v_bal = r.refund_minor then coalesce(r.refunded_at, now()) else r.refunded_at end
     where r.id = new.id;
    perform private.move_balance(o.user_id, o.market_id, v_bal, 'refund', null, o.id, new.id)
    from public.orders o where o.id = new.order_id;
  end if;
  return null;
end
$$;

create trigger returns_split_refund
  after update of refund_status on public.returns
  for each row
  when (old.refund_status is null and new.refund_status in ('pending', 'succeeded') and new.refund_to = 'original')
  execute function private.returns_split_refund();

revoke execute on function private.balance_refund_share(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- place_order (as in 20261230090000_no_rush_shipping) with p_use_balance.
-- ---------------------------------------------------------------------------
drop function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean, integer, text, text);

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
  p_use_balance boolean default false
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
    pickup_point_id, pickup_code, bank, bank_offer_id, no_rush_reward_minor, balance_minor, charged_minor
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
    v_point.id, v_code, v_bank, case when v_bank_sum > 0 then v_offer.id end, v_reward, v_balance,
    case when v_balance > 0 then v_total - v_balance end
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

revoke execute on function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean, integer, text, text, boolean) from public, anon;
grant execute on function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean, integer, text, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- confirm_order_payment (as in 20261023090000_confirm_after_cancel): a split order's card pays
-- charged_minor; reviving one takes its balance part again (balance_spent if gone).
-- ---------------------------------------------------------------------------
create or replace function public.confirm_order_payment(
  p_order_id      text,
  p_session_id    text,
  p_amount_minor  integer,
  p_currency      text,
  p_payment_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line  record;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status = 'placed' then
    return private.order_json(p_order_id);
  end if;
  -- paid once and cancelled since (the shopper or an admin cancelled it, or it sold out before the
  -- payment landed): its refund is owed or done, so confirming the same payment again (the success
  -- page reopened, a webhook retried) leaves it cancelled
  if v_order.status = 'cancelled' and (v_order.placed_at is not null or v_order.refund_status is not null) then
    return private.order_json(p_order_id);
  end if;
  if v_order.payment_method <> 'card' then
    raise exception 'not_a_card_order' using errcode = 'P0001';
  end if;
  if v_order.stripe_session_id is not null and v_order.stripe_session_id <> p_session_id then
    raise exception 'session_mismatch' using errcode = 'P0001';
  end if;
  -- the card pays what the balance didn't
  if p_amount_minor is distinct from coalesce(v_order.charged_minor, v_order.total_minor)
     or upper(p_currency) is distinct from v_order.currency then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  if v_order.status = 'cancelled' then
    for v_line in
      select oi.product_id, oi.qty, p.stock
      from public.order_items oi join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
      order by oi.product_id
      for update of p
    loop
      if v_line.stock < v_line.qty then
        raise exception 'stock_released' using errcode = 'P0001', detail = v_line.product_id;
      end if;
    end loop;
    -- its balance part went back when it was cancelled: take it again, if it's still there
    if v_order.balance_minor > 0 then
      if coalesce((select b.balance_minor from public.store_balances b
                    where b.user_id = v_order.user_id and b.market_id = v_order.market_id), 0)
         < v_order.balance_minor then
        raise exception 'balance_spent' using errcode = 'P0001';
      end if;
      perform private.move_balance(v_order.user_id, v_order.market_id, -v_order.balance_minor, 'order', null, p_order_id);
    end if;
    update public.products p
       set stock = p.stock - oi.qty
      from public.order_items oi
     where oi.order_id = p_order_id and p.id = oi.product_id;
  end if;

  update public.orders o
     set status = 'placed',
         placed_at = now(),
         cancelled_at = null,
         stripe_session_id = p_session_id,
         payment_label = coalesce(nullif(btrim(p_payment_label), ''), o.payment_label)
   where o.id = p_order_id;

  -- take the purchased quantities out of the buyer's cart (other lines stay); Buy Now never used it
  if v_order.from_cart then
    delete from public.cart_items ci
     using public.carts c, public.order_items oi
     where c.id = ci.cart_id and c.user_id = v_order.user_id and c.market_id = v_order.market_id
       and oi.order_id = p_order_id and oi.product_id = ci.product_id and ci.qty <= oi.qty;
    update public.cart_items ci
       set qty = ci.qty - oi.qty
      from public.carts c, public.order_items oi
     where c.id = ci.cart_id and c.user_id = v_order.user_id and c.market_id = v_order.market_id
       and oi.order_id = p_order_id and oi.product_id = ci.product_id and ci.qty > oi.qty;
  end if;

  return private.order_json(p_order_id);
end
$$;

-- ---------------------------------------------------------------------------
-- return_json (as in 20261216090000_return_methods) with the refund's balance part.
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
    'refund_minor', r.refund_minor, 'balance_refund_minor', r.balance_refund_minor,
    'refund_status', r.refund_status, 'refunded_at', r.refunded_at, 'refund_to', r.refund_to,
    'dropoff_code', r.dropoff_code, 'dropoff_by', r.dropoff_by, 'reject_note', r.reject_note,
    'method', r.method, 'pickup_on', r.pickup_on,
    'dropoff_point', (
      select jsonb_build_object(
               'id', pp.id, 'kind', pp.kind, 'name', pp.name, 'line1', pp.line1, 'city', pp.city,
               'state', pp.state, 'postcode', pp.postcode, 'hours', pp.hours, 'hold_days', pp.hold_days
             )
      from public.pickup_points pp
      where pp.id = r.dropoff_point_id
    ),
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
