/*
 * Delivery speed: next to standard delivery, checkout offers a paid faster
 * option. A fast order ships 3 hours after it's placed and goes out on the
 * evening run (out for delivery 17:00, delivered 19:30 local) on the first day
 * that run leaves at least 2 hours after shipping: the same day for orders
 * placed by noon, the next day otherwise. It's only offered when it arrives
 * before standard delivery would. Its fee is per store and is never free.
 */
alter table public.markets
  add column fast_ship_fee_minor integer not null default 0 check (fast_ship_fee_minor >= 0);
update public.markets set fast_ship_fee_minor = case id when 'IN' then 9900 else 999 end;

alter table public.orders
  add column ship_speed text not null default 'standard' check (ship_speed in ('standard', 'fast'));

-- Evening-run schedule for a fast parcel shipped at p_shipped (mirrored in lib/decision/tracking.ts).
create function private.fast_delivery_after(
  p_shipped timestamptz,
  p_tz text,
  out out_for_delivery timestamptz,
  out delivered timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_day date := (p_shipped at time zone p_tz)::date;
begin
  loop
    out_for_delivery := (v_day + time '17:00') at time zone p_tz;
    exit when out_for_delivery >= p_shipped + interval '2 hours';
    v_day := v_day + 1;
  end loop;
  delivered := (v_day + time '19:30') at time zone p_tz;
end
$$;

-- Whether an order placed at p_at would get a fast parcel there sooner than a standard one.
create function private.fast_delivery_offered(p_market text, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select f.delivered < s.delivered
  from public.markets m
  cross join lateral private.fast_delivery_after(p_at + interval '3 hours', m.time_zone) f
  cross join lateral private.delivery_after(p_at + interval '10 hours', m.time_zone) s
  where m.id = p_market
$$;

-- The schedule filled on placement follows the order's delivery speed.
create or replace function public.orders_fill_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_d  record;
begin
  if new.status = 'placed' and new.placed_at is not null and new.shipped_at is null then
    select m.time_zone into v_tz from public.markets m where m.id = new.market_id;
    if new.ship_speed = 'fast' then
      new.shipped_at := new.placed_at + interval '3 hours';
      select * into v_d from private.fast_delivery_after(new.shipped_at, coalesce(v_tz, 'UTC'));
    else
      new.shipped_at := new.placed_at + interval '10 hours';
      select * into v_d from private.delivery_after(new.shipped_at, coalesce(v_tz, 'UTC'));
    end if;
    new.out_for_delivery_at := v_d.out_for_delivery;
    new.delivered_at := v_d.delivered;
  end if;
  return new;
end
$$;

drop function public.place_order(text, text, jsonb, boolean, text);

/**
 * Turn the caller's cart into an order. Locks the product rows, checks and
 * reserves stock, prices every line from the catalog (never from the client),
 * and snapshots title/image/price. Card orders start 'awaiting_payment' and
 * keep the cart until Stripe confirms; every other method is placed at once.
 * A cart holding an archived product can't be checked out. A gift order keeps
 * its note (trimmed, at most 240 characters); a note without the gift flag is
 * dropped. p_speed is 'standard' or 'fast' (when offered right now; the store's
 * fast fee replaces the standard delivery charge).
 */
create function public.place_order(
  p_market text,
  p_payment_method text,
  p_shipping jsonb,
  p_gift boolean default false,
  p_gift_message text default null,
  p_speed text default 'standard'
)
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
  v_speed    text := coalesce(p_speed, 'standard');
  v_ship_fee integer;
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
  v_gift     boolean := coalesce(p_gift, false);
  -- only a gift carries a note; blank is none
  v_note     text := case when coalesce(p_gift, false)
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
  -- faster delivery has its own fee, never free
  v_ship_fee := case when v_speed = 'fast'
                  then (select m.fast_ship_fee_minor from public.markets m where m.id = p_market)
                  else v_t.ship_minor end;

  v_order_id := private.new_order_id(p_market);
  v_status := case when p_payment_method = 'card' then 'awaiting_payment' else 'placed' end;

  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, ship_minor, tax_minor, total_minor,
    ship_name, ship_phone, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postcode,
    gift, gift_message, ship_speed, placed_at
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
    v_t.subtotal_minor, v_ship_fee, v_t.tax_minor, v_t.subtotal_minor + v_ship_fee + v_t.tax_minor,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
    v_gift, v_note, v_speed,
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

revoke execute on function private.fast_delivery_offered(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.place_order(text, text, jsonb, boolean, text, text) from public, anon;
grant execute on function public.place_order(text, text, jsonb, boolean, text, text) to authenticated, service_role;
