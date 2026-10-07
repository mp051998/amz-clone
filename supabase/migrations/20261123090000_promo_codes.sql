-- Promotion codes, as at Amazon's checkout ("Add a gift card or promotion code"): a code takes a
-- percentage off the qualifying items (the whole store, or one category), on orders whose
-- qualifying items come to the code's minimum spend, while it runs, a set number of times per
-- customer. It applies after any clipped coupon, and is folded into each item's
-- unit_discount_minor (unit_promo_minor says how much of it is the promotion), so cancelling or
-- returning an item gives back what was actually paid for it.
--
-- Codes are read through RPCs only: checkout_quote() prices a checkout with a code (or says
-- why it doesn't apply), place_order() takes it, and active_promo_codes() lists a store's
-- running promotions.

create table public.promo_codes (
  market_id         text not null references public.markets (id),
  code              text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  percent_off       smallint not null check (percent_off between 1 and 50),
  -- one category, or the whole store
  category_slug     text references public.categories (slug),
  -- what the qualifying items must come to, after coupons
  min_spend_minor   integer not null default 0 check (min_spend_minor >= 0),
  uses_per_customer smallint not null default 1 check (uses_per_customer >= 1),
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz,
  description       text not null check (char_length(description) between 1 and 160),
  created_at        timestamptz not null default now(),
  primary key (market_id, code),
  check (ends_at is null or ends_at > starts_at)
);

alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;

alter table public.orders
  add column promo_code text,
  add constraint orders_promo_code_fkey foreign key (market_id, promo_code) references public.promo_codes (market_id, code);
create index orders_promo_idx on public.orders (user_id, market_id, promo_code) where promo_code is not null;

alter table public.order_items
  add column unit_promo_minor integer not null default 0,
  add constraint order_items_unit_promo_check check (unit_promo_minor >= 0 and unit_promo_minor <= unit_discount_minor);

-- ---------------------------------------------------------------------------
-- Whether a code applies to these lines for this shopper: {code, percent_off, category_slug,
-- description} or {error[, detail]} with error promo_invalid (no such code in this store),
-- promo_expired (not running), promo_used (used up by this shopper's orders that weren't
-- cancelled), promo_not_eligible (none of the items qualify) or promo_min_spend (detail: the
-- minimum, in minor units).
-- ---------------------------------------------------------------------------
create function private.promo_check(p_market text, p_uid uuid, p_code text, p_items jsonb)
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
         coalesce(sum((p.price_minor - private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor)) * l.qty), 0)::integer
    into v_any, v_spend
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, selected boolean)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = p_uid and cc.product_id = l.product_id
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

-- What a promotion takes off one unit, after its coupon (0 when it doesn't qualify or there's none).
create function private.promo_unit_discount(p_promo jsonb, p_category text, p_price integer, p_coupon integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_promo ? 'percent_off' and (p_promo ->> 'category_slug' is null or p_promo ->> 'category_slug' = p_category)
      then floor((p_price - p_coupon) * (p_promo ->> 'percent_off')::integer / 100.0)::integer
    else 0
  end
$$;

revoke execute on function private.promo_check(text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function private.promo_unit_discount(jsonb, text, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- checkout_json (as in 20261122090000_cart_price_changes) takes an optional promotion from
-- promo_check(): each line's discount_minor includes it and promo_minor says how much; the
-- totals add promo_minor (inside discount_minor), and `promo` names the code. Callers that
-- don't pass one are unchanged.
-- ---------------------------------------------------------------------------
drop function private.checkout_json(text, uuid, jsonb);

create function private.checkout_json(p_market text, p_uid uuid, p_items jsonb, p_promo jsonb default null)
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
      'added_price_minor', l.added_price_minor
    ) order by l.n), '[]'::jsonb),
    coalesce(sum(l.qty), 0)::integer,
    coalesce(sum(l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(cp.price_minor * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum((cd.unit + pd.unit) * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(pd.unit * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(pu.unit * l.qty) filter (where coalesce(l.selected, true) and coalesce(l.protection, false)), 0)::integer
  into v_lines, v_count, v_picked, v_sub, v_disc, v_promo, v_prot
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, n integer, selected boolean, protection boolean, added_price_minor integer)
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

revoke execute on function private.checkout_json(text, uuid, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- checkout_quote: the caller's checkout (their cart's ticked lines, or Buy Now's
-- {product_id, qty, protection}) priced with a promotion code: {cart, promo_error,
-- promo_error_detail}. A code that doesn't apply leaves the cart priced without it.
-- ---------------------------------------------------------------------------
create function public.checkout_quote(p_market text, p_promo_code text, p_buy jsonb default null)
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
      coalesce(p_buy ->> 'protection', '') = 'true'
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

revoke execute on function public.checkout_quote(text, text, jsonb) from public, anon;
grant execute on function public.checkout_quote(text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- active_promo_codes: a store's running promotions, for the coupons page.
-- ---------------------------------------------------------------------------
create function public.active_promo_codes(p_market text)
returns table (code text, percent_off smallint, category_slug text, category_name text, min_spend_minor integer, description text, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pc.code, pc.percent_off, pc.category_slug, c.name, pc.min_spend_minor, pc.description, pc.ends_at
  from public.promo_codes pc
  left join public.categories c on c.slug = pc.category_slug
  where pc.market_id = p_market and pc.starts_at <= now() and (pc.ends_at is null or pc.ends_at > now())
  order by pc.percent_off desc, pc.code
$$;

revoke execute on function public.active_promo_codes(text) from public;
grant execute on function public.active_promo_codes(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- place_order (as in 20261120090000_emi_orders) takes p_promo_code. The old signature goes, so
-- PostgREST sees one function.
-- ---------------------------------------------------------------------------
drop function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean, integer);

create function public.place_order(
  p_market text,
  p_payment_method text,
  p_shipping jsonb,
  p_gift boolean default false,
  p_gift_message text default null,
  p_speed text default 'standard',
  -- Buy Now: {product_id, qty}; the order is that line alone and the cart is left as it is
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
      coalesce(p_buy ->> 'protection', '') = 'true'
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

  -- lock in a stable order (deadlock-safe) and verify every line is on sale and in stock
  for v_line in
    select l.product_id, l.qty, p.stock, p.archived_at
    from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
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

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty, unit_discount_minor, unit_promo_minor, protection_minor)
  select v_order_id, l.n, p.id, p.title, p.image, p.seller, p.price_minor, l.qty,
         cd.unit + pd.unit, pd.unit,
         case when l.protection then coalesce(private.protection_unit_minor(p_market, p.category_slug, p.price_minor), 0) else 0 end
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer, protection boolean)
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

revoke execute on function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean, integer, text) from public, anon;
grant execute on function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The stores' promotions (category ones only where the category exists).
-- ---------------------------------------------------------------------------
insert into public.promo_codes (market_id, code, percent_off, category_slug, min_spend_minor, description)
select v.market_id, v.code, v.percent_off, v.category_slug, v.min_spend_minor, v.description
from (values
  ('US', 'SAVE10', 10, null, 5000, '10% off orders of $50 or more'),
  ('US', 'HOME15', 15, 'home-kitchen', 2500, '15% off Home & Kitchen when you spend $25 on it'),
  ('IN', 'SAVE10', 10, null, 149900, '10% off orders of ₹1,499 or more'),
  ('IN', 'STYLE20', 20, 'fashion', 99900, '20% off Fashion when you spend ₹999 on it')
) as v(market_id, code, percent_off, category_slug, min_spend_minor, description)
where exists (select 1 from public.markets m where m.id = v.market_id)
  and (v.category_slug is null or exists (select 1 from public.categories c where c.slug = v.category_slug))
on conflict do nothing;
