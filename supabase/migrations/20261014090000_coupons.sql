/*
 * Coupons: about one product in seven has a percent-off coupon. A signed-in
 * shopper applies ("clips") it on the product page or in the cart; while it's
 * clipped, it takes its percent off every unit of that product in the cart and
 * at checkout, and the order keeps what was taken off.
 *
 * - coupons: at most one per product (5–50% off), readable by everyone,
 *   written by admins.
 * - coupon_clips: the coupons each shopper has applied (owner read only,
 *   changed through clip_coupon / unclip_coupon).
 * - orders.discount_minor and order_items.unit_discount_minor: the total is
 *   subtotal - discount + delivery + tax, and delivery's free threshold and the
 *   tax go by the discounted subtotal.
 * - returns refund what was paid for the items, after the coupon.
 */
create table public.coupons (
  product_id  text primary key references public.products (id) on delete cascade,
  percent_off integer not null check (percent_off between 5 and 50),
  created_at  timestamptz not null default now()
);

create table public.coupon_clips (
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.coupons (product_id) on delete cascade,
  clipped_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index coupon_clips_product_idx on public.coupon_clips (product_id);

alter table public.coupons enable row level security;
alter table public.coupon_clips enable row level security;

create policy "anyone reads coupons" on public.coupons
  for select to anon, authenticated using (true);
create policy "admins add coupons" on public.coupons
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins change coupons" on public.coupons
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins remove coupons" on public.coupons
  for delete to authenticated using ((select public.is_admin()));
create policy "read own coupon clips" on public.coupon_clips
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.coupons from anon;
revoke truncate on public.coupons from authenticated;
revoke insert, update, delete, truncate on public.coupon_clips from anon, authenticated;
revoke all on public.coupon_clips from anon;

alter table public.orders add column discount_minor integer not null default 0 check (discount_minor >= 0);
alter table public.orders drop constraint orders_total_adds_up;
alter table public.orders add constraint orders_total_adds_up check (total_minor = subtotal_minor - discount_minor + ship_minor + tax_minor);
alter table public.orders add constraint orders_discount_within_subtotal check (discount_minor <= subtotal_minor);
alter table public.order_items add column unit_discount_minor integer not null default 0;
alter table public.order_items add constraint order_items_unit_discount_check
  check (unit_discount_minor >= 0 and unit_discount_minor <= unit_price_minor);

-- The seeded coupons (scripts/build-seed.mjs), for databases seeded before they
-- existed. A no-op on a fresh database, where the seed adds them.
insert into public.coupons (product_id, percent_off)
select v.product_id, v.percent_off
from (values
  ('6181VJVcgSL', 10),
  ('714leNyXHIL', 5),
  ('71Q32spf2L', 10),
  ('711KQJBO1aL', 15),
  ('81RiFsuQynL', 10),
  ('71v2DeeTD8L', 20),
  ('71mDTOYtDSL', 25),
  ('61c04TQQ2sL', 25),
  ('410L0vF3L', 5),
  ('71d5H67c0SL', 5),
  ('61TuwUQqvL', 20),
  ('91BNEhDBzbL', 20),
  ('71LxbmXeL', 10),
  ('71crrz3XJL', 15),
  ('71jnKpPcTL', 25),
  ('61bboZ4Tc5L', 25),
  ('in-61W5VjoziL', 20),
  ('in-51pwtOYhqL', 5),
  ('in-51fdXXIWFL', 10),
  ('in-61vq6mEiQ7L', 25),
  ('in-810NYpQWZ1L', 25),
  ('in-618Nlj8pN3L', 20),
  ('in-71WvlgmKiL', 10),
  ('in-61NEUWb5A4L', 25),
  ('in-61aLy7kImQL', 10),
  ('in-61ckTgN44WL', 10),
  ('in-61qTWmEi5GL', 10),
  ('in-814n9NoAW4L', 15),
  ('in-71uneWbTPpL', 10),
  ('in-61mUc9vBJqL', 5),
  ('in-719GNPKA8OL', 20),
  ('in-61poC8L0VAL', 20),
  ('in-41t4RIHRQtL', 15),
  ('in-71S8pDT9EiL', 25),
  ('in-61ddBs1gCaL', 15),
  ('in-71ZrMvjZXZL', 15),
  ('in-71WasaFL9UL', 10)
) as v (product_id, percent_off)
join public.products p on p.id = v.product_id
on conflict do nothing;

/** What a coupon of this percent takes off one unit at this price (0 without one). */
create function private.coupon_unit_discount(p_percent integer, p_price integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(round(p_price * p_percent / 100.0)::integer, 0)
$$;

/** Apply a product's coupon for the caller. Returns { product_id, percent_off, clipped }. */
create function public.clip_coupon(p_product text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pct integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select c.percent_off into v_pct
  from public.coupons c
  join public.products p on p.id = c.product_id
  where c.product_id = p_product and p.archived_at is null;
  if v_pct is null then
    raise exception 'coupon_not_found' using errcode = 'P0002';
  end if;
  insert into public.coupon_clips (user_id, product_id) values (v_uid, p_product) on conflict do nothing;
  return jsonb_build_object('product_id', p_product, 'percent_off', v_pct, 'clipped', true);
end
$$;

/** Stop applying a product's coupon for the caller (a no-op when it isn't applied). */
create function public.unclip_coupon(p_product text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.coupon_clips cc where cc.user_id = auth.uid() and cc.product_id = p_product;
end
$$;

/**
 * Cart as JSON: priced lines (current catalog price), count, and totals. Each
 * line carries its product's coupon ({ percent_off, clipped }, or null) and
 * what an applied coupon takes off it; totals.discount_minor is the sum.
 */
create or replace function private.cart_json(p_market text, p_cart uuid)
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
  -- guest carts have no owner, so no clipped coupons
  v_uid   uuid := (select c.user_id from public.carts c where c.id = p_cart);
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product', to_jsonb(cp),
      'qty', ci.qty,
      'line_total_minor', cp.price_minor * ci.qty,
      'in_stock', cp.archived_at is null and cp.stock >= ci.qty,
      'available', cp.archived_at is null,
      'coupon', case when cou.percent_off is not null
                     then jsonb_build_object('percent_off', cou.percent_off, 'clipped', cc.user_id is not null) end,
      'discount_minor', private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor) * ci.qty
    ) order by ci.added_at, ci.product_id), '[]'::jsonb),
    coalesce(sum(ci.qty), 0)::integer,
    coalesce(sum(cp.price_minor * ci.qty), 0)::integer,
    coalesce(sum(private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor) * ci.qty), 0)::integer
  into v_lines, v_count, v_sub, v_disc
  from public.cart_items ci
  join public.catalog_products_all cp on cp.id = ci.product_id
  left join public.coupons cou on cou.product_id = ci.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = ci.product_id
  where p_cart is not null and ci.cart_id = p_cart;

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


/**
 * Turn the caller's cart into an order. Locks the product rows, checks and
 * reserves stock, prices every line from the catalog (never from the client),
 * and snapshots title/image/price. Card orders start 'awaiting_payment' and
 * keep the cart until Stripe confirms; every other method is placed at once.
 * A cart holding an archived product can't be checked out. A gift order keeps
 * its note (trimmed, at most 240 characters); a note without the gift flag is
 * dropped. p_speed is 'standard' or 'fast' (when offered right now; the store's
 * fast fee replaces the standard delivery charge). Plus members get standard
 * delivery free on every order (via order_totals) and faster delivery free too.
 * The caller's applied coupons come off their products' units (kept as
 * order_items.unit_discount_minor and orders.discount_minor).
 */
create or replace function public.place_order(
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
  v_disc     integer;
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

  select coalesce(sum(p.price_minor * ci.qty), 0)::integer,
         coalesce(sum(private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor) * ci.qty), 0)::integer
    into v_sub, v_disc
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  left join public.coupons cou on cou.product_id = ci.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = ci.product_id
  where ci.cart_id = v_cart;
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
    v_sub, v_disc, v_ship_fee, v_t.tax_minor, v_sub - v_disc + v_ship_fee + v_t.tax_minor,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
    v_gift, v_note, v_speed,
    case when v_status = 'placed' then now() end
  );

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty, unit_discount_minor)
  select v_order_id,
         row_number() over (order by ci.added_at, ci.product_id),
         p.id, p.title, p.image, p.seller, p.price_minor, ci.qty,
         private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, p.price_minor)
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  left join public.coupons cou on cou.product_id = ci.product_id
  left join public.coupon_clips cc on cc.user_id = v_uid and cc.product_id = ci.product_id
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


/**
 * Start a return (unchanged, except that items are refunded at what was paid
 * for them after a coupon, and the tax and delivery shares go by the paid
 * subtotal).
 */
create or replace function public.request_return(p_order_id text, p_items jsonb, p_reason text, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_comment   text := nullif(btrim(coalesce(p_comment, '')), '');
  v_o         record;
  v_lines     integer;
  v_ok        integer;
  v_items     integer;
  v_left      integer;
  v_prior_tax integer;
  v_prior_ship integer;
  v_tax       integer;
  v_ship      integer;
  v_code      text := upper(md5(gen_random_uuid()::text));
  v_id        uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('no_longer_needed', 'bought_by_mistake', 'better_price',
      'damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  if char_length(v_comment) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'comment';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;

  select o.id, o.status, o.delivered_at, o.subtotal_minor - o.discount_minor as paid_minor, o.tax_minor, o.ship_minor, m.return_days
    into v_o
  from public.orders o
  join public.markets m on m.id = o.market_id
  where o.id = p_order_id and o.user_id = v_uid
  for update of o;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_o.status <> 'placed' or v_o.delivered_at is null or v_o.delivered_at > now() then
    raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'not_delivered';
  end if;
  if now() > v_o.delivered_at + make_interval(days => v_o.return_days) then
    raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'window_closed';
  end if;

  -- what's asked for, per product, against what's still returnable
  with req as (
    select x.product_id, sum(x.qty)::integer as qty
    from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
    where x.qty > 0
    group by x.product_id
  ),
  avail as (
    select oi.product_id, oi.unit_price_minor - oi.unit_discount_minor as unit_paid_minor,
           oi.qty - coalesce((
             select sum(ri.qty) from public.return_items ri
             join public.returns r on r.id = ri.return_id
             where ri.order_id = oi.order_id and ri.product_id = oi.product_id and r.status in ('requested', 'received')
           ), 0) as left_qty
    from public.order_items oi
    where oi.order_id = p_order_id
  )
  select count(*)::integer,
         count(*) filter (where a.left_qty >= q.qty)::integer,
         coalesce(sum(q.qty * a.unit_paid_minor), 0)::integer,
         (select coalesce(sum(a2.left_qty), 0) from avail a2)::integer - coalesce(sum(q.qty), 0)::integer
    into v_lines, v_ok, v_items, v_left
  from req q
  left join avail a on a.product_id = q.product_id;
  if v_lines = 0 or v_ok <> v_lines then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;

  select coalesce(sum(r.tax_minor), 0), coalesce(sum(r.ship_minor), 0)
    into v_prior_tax, v_prior_ship
  from public.returns r
  where r.order_id = p_order_id and r.status in ('requested', 'received');

  v_tax := case
    when v_left = 0 then v_o.tax_minor - v_prior_tax
    else least(round(v_o.tax_minor::numeric * v_items / nullif(v_o.paid_minor, 0))::integer, v_o.tax_minor - v_prior_tax)
  end;
  v_ship := case
    when p_reason in ('damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described') then
      least(round(v_o.ship_minor::numeric * v_items / nullif(v_o.paid_minor, 0))::integer, v_o.ship_minor - v_prior_ship)
    else 0
  end;

  insert into public.returns (order_id, user_id, reason, comment, items_minor, tax_minor, ship_minor, dropoff_code, dropoff_by)
  values (p_order_id, v_uid, p_reason, v_comment, v_items, greatest(coalesce(v_tax, 0), 0), greatest(coalesce(v_ship, 0), 0),
          substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), now() + interval '14 days')
  returning id into v_id;

  insert into public.return_items (return_id, order_id, product_id, qty)
  select v_id, p_order_id, x.product_id, sum(x.qty)::integer
  from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
  where x.qty > 0
  group by x.product_id;

  return private.return_json(v_id);
end
$$;


revoke execute on function private.coupon_unit_discount(integer, integer) from public, anon, authenticated;
revoke execute on function public.clip_coupon(text) from public, anon;
revoke execute on function public.unclip_coupon(text) from public, anon;
grant execute on function public.clip_coupon(text) to authenticated, service_role;
grant execute on function public.unclip_coupon(text) to authenticated, service_role;
