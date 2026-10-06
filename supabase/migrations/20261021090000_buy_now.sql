/**
 * Buy Now checks out just the one product, at the quantity picked, and leaves the cart alone.
 * Until now it put the product in the cart and opened checkout for the whole cart, so anything
 * already in there was bought too unless the shopper noticed and went back.
 *
 * - place_order takes `p_buy` ({product_id, qty}): the order is that line alone, and the cart is
 *   neither required nor touched. Orders remember whether they came from the cart (`from_cart`),
 *   so a paid Buy Now card order doesn't take its items out of the cart either.
 * - buy_now_quote prices that line the way the cart is priced (coupons, delivery, tax), for the
 *   checkout summary.
 * - cart_json and the quote share one pricing function, checkout_json, over a list of lines.
 */

alter table public.orders
  add column from_cart boolean not null default true;

/** Cart-shaped JSON (lines, count, totals) for `p_items`: [{product_id, qty, n}], in `n` order. */
create function private.checkout_json(p_market text, p_uid uuid, p_items jsonb)
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
  v_disc  integer;
  v_t     record;
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product', to_jsonb(cp),
      'qty', l.qty,
      'line_total_minor', cp.price_minor * l.qty,
      'in_stock', cp.archived_at is null and cp.stock >= l.qty,
      'available', cp.archived_at is null,
      'coupon', case when cou.percent_off is not null
                     then jsonb_build_object('percent_off', cou.percent_off, 'clipped', cc.user_id is not null) end,
      'discount_minor', private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor) * l.qty
    ) order by l.n), '[]'::jsonb),
    coalesce(sum(l.qty), 0)::integer,
    coalesce(sum(cp.price_minor * l.qty), 0)::integer,
    coalesce(sum(private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor) * l.qty), 0)::integer
  into v_lines, v_count, v_sub, v_disc
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, n integer)
  join public.catalog_products_all cp on cp.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = p_uid and cc.product_id = l.product_id;

  -- delivery's free threshold and tax go by what's paid for the items
  select * into v_t from public.order_totals(p_market, v_sub - v_disc);

  return jsonb_build_object(
    'market', p_market,
    'currency', (select m.currency from public.markets m where m.id = p_market),
    'free_ship_threshold_minor', (select m.free_ship_threshold_minor from public.markets m where m.id = p_market),
    'lines', v_lines,
    'count', v_count,
    'totals', jsonb_build_object(
      'subtotal_minor', v_sub,
      'discount_minor', v_disc,
      'ship_minor', v_t.ship_minor,
      'tax_minor', v_t.tax_minor,
      'total_minor', v_t.total_minor
    )
  );
end
$$;

/** A cart's lines as checkout_json takes them, oldest first. */
create function private.cart_lines(p_cart uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'qty', x.qty, 'n', x.n) order by x.n), '[]'::jsonb)
  from (
    select ci.product_id, ci.qty, row_number() over (order by ci.added_at, ci.product_id) as n
    from public.cart_items ci
    where p_cart is not null and ci.cart_id = p_cart
  ) x
$$;

/** The single line Buy Now checks out: the product (in this store) at 1..the store's line limit. */
create function private.buy_now_line(p_market text, p_product text, p_qty integer)
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
    'n', 1
  ));
end
$$;

create or replace function private.cart_json(p_market text, p_cart uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- guest carts have no owner, so no clipped coupons
  select private.checkout_json(p_market, (select c.user_id from public.carts c where c.id = p_cart), private.cart_lines(p_cart))
$$;

/** Buy Now's checkout summary: the one product priced like a cart of just it. */
create function public.buy_now_quote(p_market text, p_product text, p_qty integer default 1)
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
  return private.checkout_json(p_market, auth.uid(), private.buy_now_line(p_market, p_product, p_qty));
end
$$;

drop function public.place_order(text, text, jsonb, boolean, text, text);

create function public.place_order(
  p_market text,
  p_payment_method text,
  p_shipping jsonb,
  p_gift boolean default false,
  p_gift_message text default null,
  p_speed text default 'standard',
  -- Buy Now: {product_id, qty}; the order is that line alone and the cart is left as it is
  p_buy jsonb default null
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
  v_t         record;
  v_speed     text := coalesce(p_speed, 'standard');
  v_ship_fee  integer;
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

  if v_from_cart then
    select c.id into v_cart from public.carts c where c.user_id = v_uid and c.market_id = p_market;
    v_items := private.cart_lines(v_cart);
    if jsonb_array_length(v_items) = 0 then
      raise exception 'cart_empty' using errcode = 'P0001';
    end if;
  else
    v_items := private.buy_now_line(
      p_market,
      p_buy ->> 'product_id',
      case when p_buy ->> 'qty' ~ '^[0-9]{1,4}$' then (p_buy ->> 'qty')::integer else 1 end
    );
  end if;

  -- a fresh checkout abandons any earlier unpaid one in this store
  perform private.cancel_order(o.id)
  from public.orders o
  where o.user_id = v_uid and o.market_id = p_market and o.status = 'awaiting_payment';

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

  select coalesce(sum(p.price_minor * l.qty), 0)::integer,
         coalesce(sum(private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor) * l.qty), 0)::integer
    into v_sub, v_disc
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id;
  -- delivery's free threshold and tax go by what's paid for the items
  select * into v_t from public.order_totals(p_market, v_sub - v_disc);
  -- faster delivery has its own fee, free only for Plus members
  v_ship_fee := case when v_speed <> 'fast' then v_t.ship_minor
                     when private.is_plus_member(v_uid) then 0
                     else (select m.fast_ship_fee_minor from public.markets m where m.id = p_market) end;

  v_order_id := private.new_order_id(p_market);
  v_status := case when p_payment_method = 'card' then 'awaiting_payment' else 'placed' end;

  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, discount_minor, ship_minor, tax_minor, total_minor,
    ship_name, ship_phone, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postcode,
    gift, gift_message, ship_speed, from_cart, placed_at
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
    v_sub, v_disc, v_ship_fee, v_t.tax_minor, v_sub - v_disc + v_ship_fee + v_t.tax_minor,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
    v_gift, v_note, v_speed, v_from_cart,
    case when v_status = 'placed' then now() end
  );

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty, unit_discount_minor)
  select v_order_id, l.n, p.id, p.title, p.image, p.seller, p.price_minor, l.qty,
         private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor)
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
  join public.products p on p.id = l.product_id
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = l.product_id;

  update public.products p
     set stock = p.stock - l.qty
    from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
   where p.id = l.product_id;

  if v_status = 'placed' and v_from_cart then
    delete from public.cart_items ci where ci.cart_id = v_cart;
  end if;

  return private.order_json(v_order_id);
end
$$;

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
  if v_order.payment_method <> 'card' then
    raise exception 'not_a_card_order' using errcode = 'P0001';
  end if;
  if v_order.stripe_session_id is not null and v_order.stripe_session_id <> p_session_id then
    raise exception 'session_mismatch' using errcode = 'P0001';
  end if;
  if p_amount_minor is distinct from v_order.total_minor or upper(p_currency) is distinct from v_order.currency then
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

revoke execute on function private.checkout_json(text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.cart_lines(uuid) from public, anon, authenticated;
revoke execute on function private.buy_now_line(text, text, integer) from public, anon, authenticated;
revoke execute on function public.buy_now_quote(text, text, integer) from public, anon;
grant execute on function public.buy_now_quote(text, text, integer) to authenticated, service_role;
revoke execute on function public.place_order(text, text, jsonb, boolean, text, text, jsonb) from public, anon;
grant execute on function public.place_order(text, text, jsonb, boolean, text, text, jsonb) to authenticated, service_role;
