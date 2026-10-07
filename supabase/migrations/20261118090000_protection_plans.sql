-- Protection plans, as on Amazon: an eligible item can be covered by the store's plan (US
-- "2-Year Protection Plan", India "1-Year Extended Warranty") for about a tenth of its price per
-- unit, rounded to $X.99 / ₹X99. Each store lists the categories it covers and the lowest price
-- it covers (US $25, India ₹1,000).
--
-- The plan is chosen per cart line (or with Buy Now) and kept when a guest cart merges on
-- sign-in. place_order prices it per unit on the order item (`protection_minor`) and adds it to
-- the order, untaxed and outside the free delivery threshold; a line that no longer qualifies
-- simply goes without. Cancelling items before the order ships refunds their plans with them;
-- cancelling the order refunds everything.

alter table public.markets
  add column protection_categories text[] not null default '{}',
  add column protection_min_minor integer check (protection_min_minor > 0),
  add column protection_round_minor integer check (protection_round_minor > 0);
update public.markets set
  protection_categories = case id
    when 'IN' then array['mobiles', 'electronics', 'wearables', 'computers', 'kitchen-appliances']
    else array['electronics', 'computers'] end,
  protection_min_minor = case id when 'IN' then 100000 else 2500 end,
  protection_round_minor = case id when 'IN' then 10000 else 100 end;

alter table public.cart_items
  add column protection boolean not null default false;

alter table public.order_items
  add column protection_minor integer not null default 0 check (protection_minor >= 0);
alter table public.order_cancelled_items
  add column protection_minor integer not null default 0 check (protection_minor >= 0);

alter table public.orders
  add column protection_minor integer not null default 0 check (protection_minor >= 0);
alter table public.orders drop constraint orders_total_adds_up;
alter table public.orders add constraint orders_total_adds_up
  check (total_minor = subtotal_minor - discount_minor + ship_minor + tax_minor + wrap_minor + protection_minor);

alter table public.order_cancellations
  add column protection_minor integer not null default 0 check (protection_minor >= 0);
alter table public.order_cancellations
  alter column refund_minor set expression as (items_minor + tax_minor + wrap_minor + protection_minor);

-- ---------------------------------------------------------------------------
-- The plan's price per unit for a product of `p_category` at `p_price` in a store, or null when
-- the store doesn't cover it: a tenth of the price, rounded up to the store's unit, less a cent
-- (US $7.99 for a $79.99 item) or a rupee (India ₹1,499 for a ₹14,999 one).
-- ---------------------------------------------------------------------------
create function private.protection_unit_minor(p_market text, p_category text, p_price integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (ceil(p_price / 10.0 / m.protection_round_minor) * m.protection_round_minor)::integer - m.protection_round_minor / 100
  from public.markets m
  where m.id = p_market and p_category = any (m.protection_categories) and p_price >= m.protection_min_minor
$$;
revoke execute on function private.protection_unit_minor(text, text, integer) from public, anon, authenticated;

/** A product's plan price per unit (null when it has none), for the product page. */
create function public.protection_offer(p_product text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select private.protection_unit_minor(p.market_id, p.category_slug, p.price_minor)
  from public.products p
  where p.id = p_product and p.archived_at is null
$$;
revoke execute on function public.protection_offer(text) from public;
grant execute on function public.protection_offer(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cart lines carry the plan choice (as in 20261022090000_cart_select).
-- ---------------------------------------------------------------------------
create or replace function private.cart_lines(p_cart uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'qty', x.qty, 'n', x.n, 'selected', x.selected, 'protection', x.protection) order by x.n), '[]'::jsonb)
  from (
    select ci.product_id, ci.qty, ci.selected, ci.protection, row_number() over (order by ci.added_at, ci.product_id) as n
    from public.cart_items ci
    where p_cart is not null and ci.cart_id = p_cart
  ) x
$$;

create or replace function private.selected_lines(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'qty', x.qty, 'n', x.rn, 'protection', x.protection) order by x.rn), '[]'::jsonb)
  from (
    select l.product_id, l.qty, coalesce(l.protection, false) as protection, row_number() over (order by l.n) as rn
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, n integer, selected boolean, protection boolean)
    where coalesce(l.selected, true)
  ) x
$$;

-- ---------------------------------------------------------------------------
-- checkout_json (as in 20261022090000_cart_select): each line says what its plan costs per unit
-- (`protection_unit_minor`, null when it has none) and whether it's on (`protection`); the
-- totals add the plans of the ticked lines (`protection_minor`).
-- ---------------------------------------------------------------------------
create or replace function private.checkout_json(p_market text, p_uid uuid, p_items jsonb)
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
      'discount_minor', private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor) * l.qty,
      'protection_unit_minor', pu.unit,
      'protection', coalesce(l.protection, false) and pu.unit is not null
    ) order by l.n), '[]'::jsonb),
    coalesce(sum(l.qty), 0)::integer,
    coalesce(sum(l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(cp.price_minor * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor) * l.qty)
             filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(pu.unit * l.qty) filter (where coalesce(l.selected, true) and coalesce(l.protection, false)), 0)::integer
  into v_lines, v_count, v_picked, v_sub, v_disc, v_prot
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, n integer, selected boolean, protection boolean)
  join public.catalog_products_all cp on cp.id = l.product_id
  cross join lateral (select private.protection_unit_minor(p_market, cp.category_slug, cp.price_minor) as unit) pu
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
    'selected_count', v_picked,
    'totals', jsonb_build_object(
      'subtotal_minor', v_sub,
      'discount_minor', v_disc,
      'ship_minor', v_t.ship_minor,
      'tax_minor', v_t.tax_minor,
      'protection_minor', v_prot,
      'total_minor', v_t.total_minor + v_prot
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Buy Now's line (as in 20261021090000_buy_now) and quote take the plan choice too. The old
-- signatures go, so PostgREST sees one function each.
-- ---------------------------------------------------------------------------
drop function public.buy_now_quote(text, text, integer);
drop function private.buy_now_line(text, text, integer);

create function private.buy_now_line(p_market text, p_product text, p_qty integer, p_protection boolean default false)
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
    'n', 1,
    'protection', coalesce(p_protection, false)
  ));
end
$$;
revoke execute on function private.buy_now_line(text, text, integer, boolean) from public, anon, authenticated;

create function public.buy_now_quote(p_market text, p_product text, p_qty integer default 1, p_protection boolean default false)
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
  return private.checkout_json(p_market, auth.uid(), private.buy_now_line(p_market, p_product, p_qty, p_protection));
end
$$;
revoke execute on function public.buy_now_quote(text, text, integer, boolean) from public, anon;
grant execute on function public.buy_now_quote(text, text, integer, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cart_set_protection(market, product, on): adds or drops the plan on one cart line.
-- `invalid_input` (detail `protection`) when the product has no plan.
-- ---------------------------------------------------------------------------
create function public.cart_set_protection(
  p_market      text,
  p_product_id  text,
  p_on          boolean,
  p_guest_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart uuid;
begin
  if auth.uid() is null and p_guest_token is null then
    raise exception 'cart_token_required' using errcode = '22023';
  end if;
  if p_on is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_on and public.protection_offer(p_product_id) is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'protection';
  end if;

  v_cart := private.cart_id(p_market, p_guest_token, false);
  update public.cart_items ci
     set protection = p_on
   where ci.cart_id = v_cart and ci.product_id = p_product_id;
  if not found then
    raise exception 'not_in_cart' using errcode = 'P0002';
  end if;

  return private.cart_json(p_market, v_cart);
end
$$;
revoke execute on function public.cart_set_protection(text, text, boolean, uuid) from public;
grant execute on function public.cart_set_protection(text, text, boolean, uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cart_merge_guest (as in 20260930090000_catalog_admin): a plan chosen as a guest stays on.
-- ---------------------------------------------------------------------------
create or replace function public.cart_merge_guest(p_guest_token uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_guest  record;
  v_cart   uuid;
  v_merged integer := 0;
  v_n      integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_guest_token is null then
    return 0;
  end if;

  for v_guest in
    select c.id, c.market_id from public.carts c where c.guest_token = p_guest_token
  loop
    v_cart := private.cart_id(v_guest.market_id, null, true);

    insert into public.cart_items (cart_id, product_id, qty, added_at, protection)
    select v_cart, gi.product_id, least(gi.qty, m.max_line_qty, greatest(p.stock, 1)), gi.added_at, gi.protection
    from public.cart_items gi
    join public.products p on p.id = gi.product_id
    join public.markets m on m.id = v_guest.market_id
    where gi.cart_id = v_guest.id and p.stock > 0 and p.archived_at is null
    on conflict (cart_id, product_id) do update
      set qty = least(
        public.cart_items.qty + excluded.qty,
        (select m2.max_line_qty from public.markets m2 where m2.id = v_guest.market_id),
        greatest((select p2.stock from public.products p2 where p2.id = excluded.product_id), 1)
      ),
      protection = public.cart_items.protection or excluded.protection;
    get diagnostics v_n = row_count;
    v_merged := v_merged + v_n;

    delete from public.carts c where c.id = v_guest.id;
  end loop;

  return v_merged;
end
$$;


-- ---------------------------------------------------------------------------
-- place_order (as in 20261117090000_gift_wrap): each line's plan, when asked for and still
-- offered, goes on its order item and into the total. Buy Now asks with `p_buy.protection`.
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
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
  v_prot      integer;
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
      case when p_buy ->> 'qty' ~ '^[0-9]{1,4}$' then (p_buy ->> 'qty')::integer else 1 end,
      coalesce(p_buy ->> 'protection', '') = 'true'
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

  v_order_id := private.new_order_id(p_market);
  v_status := case when p_payment_method = 'card' then 'awaiting_payment' else 'placed' end;

  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, discount_minor, ship_minor, tax_minor, wrap_minor, protection_minor, total_minor,
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
    v_sub, v_disc, v_ship_fee, v_t.tax_minor, v_wrap, v_prot, v_sub - v_disc + v_ship_fee + v_t.tax_minor + v_wrap + v_prot,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
    v_instr, v_gift, v_note, v_wrap > 0, v_speed, v_from_cart,
    case when v_status = 'placed' then now() end
  );

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty, unit_discount_minor, protection_minor)
  select v_order_id, l.n, p.id, p.title, p.image, p.seller, p.price_minor, l.qty,
         private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor),
         case when l.protection then coalesce(private.protection_unit_minor(p_market, p.category_slug, p.price_minor), 0) else 0 end
  from jsonb_to_recordset(v_items) as l(product_id text, qty integer, n integer, protection boolean)
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

-- ---------------------------------------------------------------------------
-- cancel_my_items (as in 20261117090000_gift_wrap): the cancelled lines' plans are refunded
-- with them.
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
  v_prot    integer;
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
  -- and so are the cancelled lines' protection plans
  select coalesce(sum(oi.protection_minor * oi.qty), 0)
    into v_prot
    from public.order_items oi where oi.order_id = p_order_id and oi.product_id = any (v_ids);
  v_refund := v_items + v_o.tax_minor - v_tax + v_o.wrap_minor - v_wrap + v_prot;

  v_status := case v_o.payment_method when 'card' then 'pending' when 'cod' then 'not_charged' else 'succeeded' end;
  insert into public.order_cancellations (order_id, items_minor, tax_minor, wrap_minor, protection_minor, refund_status, refunded_at)
  values (p_order_id, v_items, v_o.tax_minor - v_tax, v_o.wrap_minor - v_wrap, v_prot, v_status, case when v_status = 'succeeded' then now() end)
  returning id into v_id;

  insert into public.order_cancelled_items
    (cancellation_id, order_id, line_no, product_id, title, image, seller, unit_price_minor, unit_discount_minor, qty, protection_minor)
  select v_id, oi.order_id, oi.line_no, oi.product_id, oi.title, oi.image, oi.seller, oi.unit_price_minor, oi.unit_discount_minor, oi.qty, oi.protection_minor
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
         protection_minor = o.protection_minor - v_prot,
         total_minor = v_sub - v_disc + o.ship_minor + v_tax + v_wrap + o.protection_minor - v_prot
   where o.id = p_order_id;

  -- paid from the store balance: straight back to it
  if v_o.payment_method in ('giftcard', 'amazonpay') and v_refund > 0
     and exists (select 1 from public.balance_entries e where e.order_id = p_order_id and e.kind = 'order') then
    perform private.move_balance(v_o.user_id, v_o.market_id, v_refund, 'refund', null, p_order_id);
  end if;

  return private.order_json(p_order_id);
end
$$;
