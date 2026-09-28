-- Commerce: carts (signed-in or guest), orders with a server-computed price
-- snapshot, stock reservation, and the payment lifecycle. Every write goes
-- through a SECURITY DEFINER RPC; clients can only read their own rows.

-- ---------------------------------------------------------------------------
-- carts — one per (user, market) or (guest token, market)
-- ---------------------------------------------------------------------------
create table public.carts (
  id          uuid primary key default gen_random_uuid(),
  market_id   text not null references public.markets (id),
  user_id     uuid references auth.users (id) on delete cascade,
  guest_token uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint carts_single_owner check ((user_id is null) <> (guest_token is null))
);

create unique index carts_user_market on public.carts (user_id, market_id) where user_id is not null;
create unique index carts_guest_market on public.carts (guest_token, market_id) where guest_token is not null;

create table public.cart_items (
  cart_id    uuid not null references public.carts (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  qty        integer not null check (qty between 1 and 99),
  added_at   timestamptz not null default now(),
  primary key (cart_id, product_id)
);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

create policy "own cart" on public.carts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own cart items" on public.cart_items
  for select to authenticated using (
    exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))
  );

revoke insert, update, delete, truncate on public.carts, public.cart_items from anon, authenticated;
revoke all on public.carts, public.cart_items from anon;

-- ---------------------------------------------------------------------------
-- orders + order_items (snapshot of what was bought, at what price)
-- ---------------------------------------------------------------------------
create table public.orders (
  id                text primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  market_id         text not null references public.markets (id),
  currency          text not null,
  status            text not null check (status in ('awaiting_payment', 'placed', 'cancelled')),
  payment_method    text not null check (payment_method in ('card', 'giftcard', 'upi', 'netbanking', 'cod', 'emi', 'amazonpay')),
  payment_label     text not null,
  stripe_session_id text unique,
  subtotal_minor    integer not null check (subtotal_minor >= 0),
  ship_minor        integer not null check (ship_minor >= 0),
  tax_minor         integer not null check (tax_minor >= 0),
  total_minor       integer not null check (total_minor >= 0),
  ship_name         text not null,
  ship_phone        text not null,
  ship_line1        text not null,
  ship_line2        text,
  ship_landmark     text,
  ship_city         text not null,
  ship_state        text not null,
  ship_postcode     text not null,
  created_at        timestamptz not null default now(),
  placed_at         timestamptz,
  cancelled_at      timestamptz,
  constraint orders_total_adds_up check (total_minor = subtotal_minor + ship_minor + tax_minor)
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_pending_idx on public.orders (user_id, market_id) where status = 'awaiting_payment';

create table public.order_items (
  order_id         text not null references public.orders (id) on delete cascade,
  line_no          integer not null,
  product_id       text not null references public.products (id),
  title            text not null,
  image            text not null,
  seller           text not null,
  unit_price_minor integer not null check (unit_price_minor >= 0),
  qty              integer not null check (qty > 0),
  primary key (order_id, product_id)
);

create index order_items_product_idx on public.order_items (product_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "own orders" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

revoke insert, update, delete, truncate on public.orders, public.order_items from anon, authenticated;
revoke all on public.orders, public.order_items from anon;

-- ---------------------------------------------------------------------------
-- Pricing: the one place order totals are computed.
-- Free shipping at/over the market threshold (or for an empty cart), else a flat
-- fee; tax added on top for tax-exclusive markets, folded into price otherwise.
-- ---------------------------------------------------------------------------
create function public.order_totals(p_market text, p_subtotal integer)
returns table (subtotal_minor integer, ship_minor integer, tax_minor integer, total_minor integer)
language sql
stable
set search_path = ''
as $$
  select t.sub, t.ship, t.tax, t.sub + t.ship + t.tax
  from (
    select
      p_subtotal as sub,
      case when p_subtotal = 0 or p_subtotal >= m.free_ship_threshold_minor then 0 else m.ship_fee_minor end as ship,
      case when m.tax_inclusive then 0 else round(p_subtotal * m.tax_rate_bps / 10000.0)::integer end as tax
    from public.markets m
    where m.id = p_market
  ) t
$$;

-- ---------------------------------------------------------------------------
-- Internal helpers (private schema: not reachable through the API)
-- ---------------------------------------------------------------------------

-- Resolve (and optionally create) the caller's cart: the signed-in user's cart
-- wins; otherwise the guest cart addressed by an unguessable token.
create function private.cart_id(p_market text, p_guest_token uuid, p_create boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if not exists (select 1 from public.markets m where m.id = p_market) then
    raise exception 'unknown_market' using errcode = '22023';
  end if;

  if v_uid is not null then
    select c.id into v_id from public.carts c where c.user_id = v_uid and c.market_id = p_market;
    if v_id is null and p_create then
      insert into public.carts (market_id, user_id) values (p_market, v_uid)
      on conflict (user_id, market_id) where user_id is not null do update set updated_at = now()
      returning id into v_id;
    end if;
  elsif p_guest_token is not null then
    select c.id into v_id from public.carts c where c.guest_token = p_guest_token and c.market_id = p_market;
    if v_id is null and p_create then
      insert into public.carts (market_id, guest_token) values (p_market, p_guest_token)
      on conflict (guest_token, market_id) where guest_token is not null do update set updated_at = now()
      returning id into v_id;
    end if;
  end if;

  return v_id;
end
$$;

-- Cart as JSON: priced lines (current catalog price), count, and totals.
create function private.cart_json(p_market text, p_cart uuid)
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
  v_t     record;
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product', to_jsonb(cp),
      'qty', ci.qty,
      'line_total_minor', cp.price_minor * ci.qty,
      'in_stock', cp.stock >= ci.qty
    ) order by ci.added_at, ci.product_id), '[]'::jsonb),
    coalesce(sum(ci.qty), 0)::integer,
    coalesce(sum(cp.price_minor * ci.qty), 0)::integer
  into v_lines, v_count, v_sub
  from public.cart_items ci
  join public.catalog_products cp on cp.id = ci.product_id
  where p_cart is not null and ci.cart_id = p_cart;

  select * into v_t from public.order_totals(p_market, v_sub);

  return jsonb_build_object(
    'market', p_market,
    'currency', (select m.currency from public.markets m where m.id = p_market),
    'free_ship_threshold_minor', (select m.free_ship_threshold_minor from public.markets m where m.id = p_market),
    'lines', v_lines,
    'count', v_count,
    'totals', jsonb_build_object(
      'subtotal_minor', v_t.subtotal_minor,
      'ship_minor', v_t.ship_minor,
      'tax_minor', v_t.tax_minor,
      'total_minor', v_t.total_minor
    )
  );
end
$$;

create function private.order_json(p_order_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(o) || jsonb_build_object('items', coalesce((
    select jsonb_agg(to_jsonb(oi) - 'order_id' order by oi.line_no)
    from public.order_items oi where oi.order_id = o.id), '[]'::jsonb))
  from public.orders o
  where o.id = p_order_id
$$;

-- Human-readable, collision-checked order number: 114-1234567-1234567 (US), 402-… (IN)
create function private.new_order_id(p_market text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  loop
    v_id := case when p_market = 'IN' then '402' else '114' end
         || '-' || (1000000 + floor(random() * 9000000))::integer::text
         || '-' || (1000000 + floor(random() * 9000000))::integer::text;
    exit when not exists (select 1 from public.orders o where o.id = v_id);
  end loop;
  return v_id;
end
$$;

-- Cancel an unpaid order and return its reserved stock. No-op for other states.
create function private.cancel_order(p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders o
     set status = 'cancelled', cancelled_at = now()
   where o.id = p_order_id and o.status = 'awaiting_payment';
  if not found then
    return false;
  end if;

  update public.products p
     set stock = p.stock + oi.qty
    from public.order_items oi
   where oi.order_id = p_order_id and p.id = oi.product_id;
  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- Cart RPCs (guests pass p_guest_token; signed-in callers are resolved by JWT)
-- ---------------------------------------------------------------------------
create function public.cart_get(p_market text, p_guest_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.cart_json(p_market, private.cart_id(p_market, p_guest_token, false));
end
$$;

/**
 * Set (p_mode 'set') or increment (p_mode 'add') a line. Quantity is capped at
 * the market's per-line maximum and at available stock; 0 removes the line.
 */
create function public.cart_set_qty(
  p_market      text,
  p_product_id  text,
  p_qty         integer,
  p_mode        text default 'set',
  p_guest_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_cart    uuid;
  v_max     integer;
  v_new     integer;
begin
  if p_mode not in ('set', 'add') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  if auth.uid() is null and p_guest_token is null then
    raise exception 'cart_token_required' using errcode = '22023';
  end if;

  select p.id, p.market_id, p.stock into v_product
  from public.products p where p.id = p_product_id;
  if not found or v_product.market_id <> p_market then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  v_cart := private.cart_id(p_market, p_guest_token, true);
  select m.max_line_qty into v_max from public.markets m where m.id = p_market;

  if p_mode = 'add' then
    v_new := coalesce((select ci.qty from public.cart_items ci
                       where ci.cart_id = v_cart and ci.product_id = p_product_id), 0)
             + greatest(coalesce(p_qty, 1), 1);
  else
    v_new := coalesce(p_qty, 0);
  end if;
  v_new := least(v_new, v_max);

  if v_new <= 0 then
    delete from public.cart_items ci where ci.cart_id = v_cart and ci.product_id = p_product_id;
  else
    if v_product.stock <= 0 then
      raise exception 'out_of_stock' using errcode = 'P0001';
    end if;
    v_new := least(v_new, v_product.stock);
    insert into public.cart_items (cart_id, product_id, qty)
    values (v_cart, p_product_id, v_new)
    on conflict (cart_id, product_id) do update set qty = excluded.qty;
  end if;

  update public.carts c set updated_at = now() where c.id = v_cart;
  return private.cart_json(p_market, v_cart);
end
$$;

create function public.cart_clear(p_market text, p_guest_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart uuid := private.cart_id(p_market, p_guest_token, false);
begin
  if v_cart is not null then
    delete from public.cart_items ci where ci.cart_id = v_cart;
  end if;
  return private.cart_json(p_market, v_cart);
end
$$;

-- After sign-in: fold every guest cart for this token into the user's carts.
create function public.cart_merge_guest(p_guest_token uuid)
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

    insert into public.cart_items (cart_id, product_id, qty, added_at)
    select v_cart, gi.product_id, least(gi.qty, m.max_line_qty, greatest(p.stock, 1)), gi.added_at
    from public.cart_items gi
    join public.products p on p.id = gi.product_id
    join public.markets m on m.id = v_guest.market_id
    where gi.cart_id = v_guest.id and p.stock > 0
    on conflict (cart_id, product_id) do update
      set qty = least(
        public.cart_items.qty + excluded.qty,
        (select m2.max_line_qty from public.markets m2 where m2.id = v_guest.market_id),
        greatest((select p2.stock from public.products p2 where p2.id = excluded.product_id), 1)
      );
    get diagnostics v_n = row_count;
    v_merged := v_merged + v_n;

    delete from public.carts c where c.id = v_guest.id;
  end loop;

  return v_merged;
end
$$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

/**
 * Turn the caller's cart into an order. Locks the product rows, checks and
 * reserves stock, prices every line from the catalog (never from the client),
 * and snapshots title/image/price. Card orders start 'awaiting_payment' and
 * keep the cart until Stripe confirms; every other method is placed at once.
 */
create function public.place_order(p_market text, p_payment_method text, p_shipping jsonb)
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

  -- a fresh checkout abandons any earlier unpaid one in this store
  perform private.cancel_order(o.id)
  from public.orders o
  where o.user_id = v_uid and o.market_id = p_market and o.status = 'awaiting_payment';

  select c.id into v_cart from public.carts c where c.user_id = v_uid and c.market_id = p_market;
  if v_cart is null or not exists (select 1 from public.cart_items ci where ci.cart_id = v_cart) then
    raise exception 'cart_empty' using errcode = 'P0001';
  end if;

  -- lock in a stable order (deadlock-safe) and verify stock for every line
  for v_line in
    select ci.product_id, ci.qty, p.stock
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart
    order by ci.product_id
    for update of p
  loop
    if v_line.stock < v_line.qty then
      raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_line.product_id;
    end if;
  end loop;

  select coalesce(sum(p.price_minor * ci.qty), 0)::integer into v_sub
  from public.cart_items ci join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart;
  select * into v_t from public.order_totals(p_market, v_sub);

  v_order_id := private.new_order_id(p_market);
  v_status := case when p_payment_method = 'card' then 'awaiting_payment' else 'placed' end;

  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, ship_minor, tax_minor, total_minor,
    ship_name, ship_phone, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postcode,
    placed_at
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
    v_t.subtotal_minor, v_t.ship_minor, v_t.tax_minor, v_t.total_minor,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
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

-- Owner abandons an unpaid (card) checkout: order cancelled, stock released.
create function public.cancel_pending_order(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.user_id = auth.uid()) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  perform private.cancel_order(p_order_id);
  return private.order_json(p_order_id);
end
$$;

-- Server-only: remember which Stripe Checkout Session pays for an order.
create function public.attach_checkout_session(p_order_id text, p_session_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders o
     set stripe_session_id = p_session_id
   where o.id = p_order_id and o.status = 'awaiting_payment';
  if not found then
    raise exception 'order_not_pending' using errcode = 'P0001';
  end if;
end
$$;

/**
 * Server-only: Stripe says the session is paid. Idempotent (a refresh or a
 * second return is a no-op). Amount and currency must match the order exactly.
 * If the order was cancelled in the meantime (a newer checkout replaced it) the
 * stock is re-reserved when still available.
 */
create function public.confirm_order_payment(
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

  -- take the purchased quantities out of the buyer's cart (other lines stay)
  delete from public.cart_items ci
   using public.carts c, public.order_items oi
   where c.id = ci.cart_id and c.user_id = v_order.user_id and c.market_id = v_order.market_id
     and oi.order_id = p_order_id and oi.product_id = ci.product_id and ci.qty <= oi.qty;
  update public.cart_items ci
     set qty = ci.qty - oi.qty
    from public.carts c, public.order_items oi
   where c.id = ci.cart_id and c.user_id = v_order.user_id and c.market_id = v_order.market_id
     and oi.order_id = p_order_id and oi.product_id = ci.product_id and ci.qty > oi.qty;

  return private.order_json(p_order_id);
end
$$;

-- Server-only: a Checkout Session expired unpaid (Stripe webhook). Release the
-- reserved stock. No-op when the order was already paid or cancelled.
create function public.release_checkout_session(p_session_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  select o.id into v_id
  from public.orders o
  where o.stripe_session_id = p_session_id and o.status = 'awaiting_payment'
  for update;
  if v_id is not null then
    perform private.cancel_order(v_id);
  end if;
  return v_id;
end
$$;

-- Housekeeping: drop guest carts nobody has touched in 30 days.
create function public.purge_stale_guest_carts(p_older_than interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.carts c where c.guest_token is not null and c.updated_at < now() - p_older_than;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- ---------------------------------------------------------------------------
-- Grants: who may call what over the API
-- ---------------------------------------------------------------------------
revoke execute on function public.order_totals(text, integer) from public;
revoke execute on function public.cart_get(text, uuid) from public;
revoke execute on function public.cart_set_qty(text, text, integer, text, uuid) from public;
revoke execute on function public.cart_clear(text, uuid) from public;
revoke execute on function public.cart_merge_guest(uuid) from public, anon;
revoke execute on function public.place_order(text, text, jsonb) from public, anon;
revoke execute on function public.cancel_pending_order(text) from public, anon;
revoke execute on function public.attach_checkout_session(text, text) from public, anon, authenticated;
revoke execute on function public.confirm_order_payment(text, text, integer, text, text) from public, anon, authenticated;
revoke execute on function public.purge_stale_guest_carts(interval) from public, anon, authenticated;
revoke execute on function public.release_checkout_session(text) from public, anon, authenticated;

grant execute on function public.order_totals(text, integer) to anon, authenticated, service_role;
grant execute on function public.cart_get(text, uuid) to anon, authenticated, service_role;
grant execute on function public.cart_set_qty(text, text, integer, text, uuid) to anon, authenticated, service_role;
grant execute on function public.cart_clear(text, uuid) to anon, authenticated, service_role;
grant execute on function public.cart_merge_guest(uuid) to authenticated, service_role;
grant execute on function public.place_order(text, text, jsonb) to authenticated, service_role;
grant execute on function public.cancel_pending_order(text) to authenticated, service_role;
grant execute on function public.attach_checkout_session(text, text) to service_role;
grant execute on function public.confirm_order_payment(text, text, integer, text, text) to service_role;
grant execute on function public.purge_stale_guest_carts(interval) to service_role;
grant execute on function public.release_checkout_session(text) to service_role;
