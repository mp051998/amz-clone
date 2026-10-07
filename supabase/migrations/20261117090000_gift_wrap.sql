-- Gift wrap, as on Amazon: a gift order can have every item gift-wrapped for the store's fee per
-- unit (US $3.99, India ₹30). The wrap is its own line on the order: untaxed, outside the free
-- delivery threshold, and part of what's charged. Cancelling some items before the order ships
-- gives back their units' wrap with their refund; cancelling the order gives back everything.
-- A return refunds the items, not the wrap.

alter table public.markets
  add column gift_wrap_minor integer check (gift_wrap_minor > 0);
update public.markets set gift_wrap_minor = case id when 'IN' then 3000 else 399 end;

alter table public.orders
  add column gift_wrap  boolean not null default false,
  add column wrap_minor integer not null default 0 check (wrap_minor >= 0),
  add constraint orders_wrap_is_a_gift check (not gift_wrap or gift),
  add constraint orders_wrap_only_wrapped check (gift_wrap or wrap_minor = 0);

alter table public.orders drop constraint orders_total_adds_up;
alter table public.orders add constraint orders_total_adds_up
  check (total_minor = subtotal_minor - discount_minor + ship_minor + tax_minor + wrap_minor);

alter table public.order_cancellations
  add column wrap_minor integer not null default 0 check (wrap_minor >= 0);
alter table public.order_cancellations
  alter column refund_minor set expression as (items_minor + tax_minor + wrap_minor);

-- ---------------------------------------------------------------------------
-- place_order (as in 20261024090000_delivery_instructions) also takes p_gift_wrap. The old
-- signature goes, so PostgREST sees one function.
-- ---------------------------------------------------------------------------
drop function public.place_order(text, text, jsonb, boolean, text, text, jsonb);

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
  p_gift_wrap boolean default false
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
  v_wrap      integer := 0;
  v_wrap_fee  integer;
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
  -- gift wrap is per unit, untaxed, and has no bearing on free delivery
  if v_wrap_fee is not null then
    select v_wrap_fee * coalesce(sum(l.qty), 0)::integer into v_wrap
    from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer);
  end if;

  v_order_id := private.new_order_id(p_market);
  v_status := case when p_payment_method = 'card' then 'awaiting_payment' else 'placed' end;

  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, discount_minor, ship_minor, tax_minor, wrap_minor, total_minor,
    ship_name, ship_phone, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postcode,
    ship_instructions, gift, gift_message, gift_wrap, ship_speed, from_cart, placed_at
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
    v_sub, v_disc, v_ship_fee, v_t.tax_minor, v_wrap, v_sub - v_disc + v_ship_fee + v_t.tax_minor + v_wrap,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
    v_instr, v_gift, v_note, v_wrap > 0, v_speed, v_from_cart,
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

  -- only what was ordered leaves the cart; unticked lines wait for next time
  if v_status = 'placed' and v_from_cart then
    delete from public.cart_items ci
     using jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer)
     where ci.cart_id = v_cart and ci.product_id = l.product_id;
  end if;

  return private.order_json(v_order_id);
end
$$;

revoke execute on function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean) from public, anon;
grant execute on function public.place_order(text, text, jsonb, boolean, text, text, jsonb, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cancel_my_items (as in 20261112090000_cancel_items): the order keeps the wrap of the units
-- left, and the cancelled units' wrap is refunded with them.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_my_items(p_order_id text, p_product_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.orders;
  v_ids     text[];
  v_lines   integer;
  v_picked  integer;
  v_sub     integer;
  v_disc    integer;
  v_tax     integer;
  v_items   integer;
  v_units   integer;
  v_left    integer;
  v_wrap    integer;
  v_refund  integer;
  v_status  text;
  v_id      uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_product_ids, '{}'::text[])) x where x is not null;
  if v_ids is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;

  select * into v_o from public.orders o where o.id = p_order_id and o.user_id = auth.uid() for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_o.status <> 'placed'
     or private.order_stage(v_o.status, v_o.shipped_at, v_o.out_for_delivery_at, v_o.delivered_at) <> 'preparing' then
    raise exception 'order_not_cancellable' using errcode = 'P0001';
  end if;

  select count(*), count(*) filter (where oi.product_id = any (v_ids))
    into v_lines, v_picked
    from public.order_items oi where oi.order_id = p_order_id;
  if v_picked <> cardinality(v_ids) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;
  if v_picked = v_lines then
    perform private.cancel_placed_order(p_order_id, 'customer');
    return private.order_json(p_order_id);
  end if;

  -- the order repriced over the lines left; tax only ever goes down, delivery stays as charged
  select coalesce(sum(oi.unit_price_minor * oi.qty), 0), coalesce(sum(oi.unit_discount_minor * oi.qty), 0)
    into v_sub, v_disc
    from public.order_items oi where oi.order_id = p_order_id and not (oi.product_id = any (v_ids));
  select least(v_o.tax_minor, case when m.tax_inclusive then 0 else round((v_sub - v_disc) * m.tax_rate_bps / 10000.0)::integer end)
    into v_tax
    from public.markets m where m.id = v_o.market_id;
  select coalesce(sum((oi.unit_price_minor - oi.unit_discount_minor) * oi.qty), 0)
    into v_items
    from public.order_items oi where oi.order_id = p_order_id and oi.product_id = any (v_ids);
  -- gift wrap is per unit: the cancelled units' wrap comes back with them
  select coalesce(sum(oi.qty), 0), coalesce(sum(oi.qty) filter (where not (oi.product_id = any (v_ids))), 0)
    into v_units, v_left
    from public.order_items oi where oi.order_id = p_order_id;
  v_wrap := case when v_units > 0 then v_o.wrap_minor / v_units * v_left else 0 end;
  v_refund := v_items + v_o.tax_minor - v_tax + v_o.wrap_minor - v_wrap;

  v_status := case v_o.payment_method when 'card' then 'pending' when 'cod' then 'not_charged' else 'succeeded' end;
  insert into public.order_cancellations (order_id, items_minor, tax_minor, wrap_minor, refund_status, refunded_at)
  values (p_order_id, v_items, v_o.tax_minor - v_tax, v_o.wrap_minor - v_wrap, v_status, case when v_status = 'succeeded' then now() end)
  returning id into v_id;

  insert into public.order_cancelled_items
    (cancellation_id, order_id, line_no, product_id, title, image, seller, unit_price_minor, unit_discount_minor, qty)
  select v_id, oi.order_id, oi.line_no, oi.product_id, oi.title, oi.image, oi.seller, oi.unit_price_minor, oi.unit_discount_minor, oi.qty
    from public.order_items oi where oi.order_id = p_order_id and oi.product_id = any (v_ids);

  update public.products p
     set stock = p.stock + oi.qty
    from public.order_items oi
   where oi.order_id = p_order_id and oi.product_id = any (v_ids) and p.id = oi.product_id;

  delete from public.order_items oi where oi.order_id = p_order_id and oi.product_id = any (v_ids);

  update public.orders o
     set subtotal_minor = v_sub,
         discount_minor = v_disc,
         tax_minor = v_tax,
         wrap_minor = v_wrap,
         total_minor = v_sub - v_disc + o.ship_minor + v_tax + v_wrap
   where o.id = p_order_id;

  -- paid from the store balance: straight back to it
  if v_o.payment_method in ('giftcard', 'amazonpay') and v_refund > 0
     and exists (select 1 from public.balance_entries e where e.order_id = p_order_id and e.kind = 'order') then
    perform private.move_balance(v_o.user_id, v_o.market_id, v_refund, 'refund', null, p_order_id);
  end if;

  return private.order_json(p_order_id);
end
$$;
