/*
 * Subscribe & Save, as on Amazon: a product people run out of (skin care, here) can be subscribed
 * to, delivered every 1 to 6 months. Each delivery is an ordinary order the store places on the
 * day, at 5% off each item, 15% off when 5 or more subscriptions arrive in the same delivery, and
 * always with free delivery. Signing up places the first delivery straight away; after that the
 * store places them (pg_cron, hourly, by each store's own date). Shoppers skip a delivery, change
 * how many and how often, move it to another of their addresses, or cancel, at any time.
 *
 * Nobody is at the checkout when a delivery is placed, so it's paid with what the store can charge
 * by itself: the store balance (gift card / Amazon Pay), or in India UPI and net banking (settled
 * on the spot, as at checkout). A delivery that can't be sent (out of stock, off sale, no address,
 * not enough balance) is skipped, and the subscription says why until the next one goes.
 */

-- ---------------------------------------------------------------------------
-- Which products can be subscribed to, and how each store takes payment for deliveries
-- ---------------------------------------------------------------------------
alter table public.products
  add column subscribe_save boolean not null default false,
  -- another seller's offer is bought as it is; only the product itself is subscribed to
  add constraint products_offer_no_subscribe check (offer_of is null or not subscribe_save);

-- admins write it like the other product fields (column grants, admin.sql)
grant insert (subscribe_save), update (subscribe_save) on public.products to authenticated;

alter table public.markets
  add column subscribe_methods text[] not null default '{}';

update public.markets set subscribe_methods = '{giftcard}' where id = 'US';
update public.markets set subscribe_methods = '{upi,netbanking,amazonpay}' where id = 'IN';

-- skin care is what's subscribed to here (not what's limited per customer: that's a lifetime
-- limit, and deliveries would soon run into it)
update public.products set subscribe_save = true
 where category_slug = 'beauty' and offer_of is null and max_per_customer is null;

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  market_id      text not null references public.markets (id),
  product_id     text not null references public.products (id) on delete cascade,
  qty            smallint not null check (qty between 1 and 10),
  every_months   smallint not null check (every_months between 1 and 6),
  -- the store's date the next delivery is placed on
  next_on        date not null,
  address_id     uuid references public.addresses (id) on delete set null,
  payment_method text not null,
  status         text not null default 'active' check (status in ('active', 'cancelled')),
  -- why the last delivery wasn't sent, until one is
  issue          text check (issue in ('out_of_stock', 'unavailable', 'address', 'payment')),
  issue_on       date,
  last_order_id  text references public.orders (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  cancelled_at   timestamptz,
  constraint subscriptions_issue_dated check ((issue is null) = (issue_on is null)),
  constraint subscriptions_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);

-- one subscription to a product at a time
create unique index subscriptions_one_active on public.subscriptions (user_id, product_id) where status = 'active';
create index subscriptions_due_idx on public.subscriptions (next_on) where status = 'active';
create index subscriptions_user_idx on public.subscriptions (user_id, market_id, created_at desc);
create index subscriptions_product_idx on public.subscriptions (product_id);
create index subscriptions_address_idx on public.subscriptions (address_id);
create index subscriptions_last_order_idx on public.subscriptions (last_order_id);

alter table public.subscriptions enable row level security;

create policy "shoppers read their subscriptions" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

-- read through the policy; every change goes through the functions below
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- an order line a subscription delivered, and its Subscribe & Save discount per unit (part of
-- unit_discount_minor, as the quantity discount and promotion are)
alter table public.order_items
  add column subscription_id uuid references public.subscriptions (id) on delete set null,
  add column unit_sns_minor integer not null default 0 check (unit_sns_minor >= 0);

create index order_items_subscription_idx on public.order_items (subscription_id);

-- ---------------------------------------------------------------------------
-- Pricing and dates
-- ---------------------------------------------------------------------------

-- 5% off, 15% when 5 or more subscriptions arrive together
create function private.sns_pct(p_items integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_items >= 5 then 15 else 5 end
$$;

create function private.sns_unit_discount(p_price integer, p_pct integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select floor(p_price * p_pct / 100.0)::integer
$$;

-- today in the store, by its own clock
create function private.store_today(p_market text)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone coalesce((select m.time_zone from public.markets m where m.id = p_market), 'UTC'))::date
$$;

-- the first delivery date after p_after, every p_every months from p_from
create function private.sns_next_on(p_from date, p_every integer, p_after date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_from + make_interval(months => p_every * n))::date
  from generate_series(1, 1200) n
  where (p_from + make_interval(months => p_every * n))::date > p_after
  order by n
  limit 1
$$;

revoke execute on function private.sns_pct(integer) from public, anon, authenticated;
revoke execute on function private.sns_unit_discount(integer, integer) from public, anon, authenticated;
revoke execute on function private.store_today(text) from public, anon, authenticated;
revoke execute on function private.sns_next_on(date, integer, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Placing a delivery
-- ---------------------------------------------------------------------------

/**
 * One delivery of a shopper's subscriptions that share an address and payment method: an order of
 * those still on sale and in stock (the others are marked out_of_stock / unavailable), each at the
 * Subscribe & Save price, free delivery. Null when nothing could go. Raises address_not_found
 * (the address is gone), payment_method_unavailable, or insufficient_balance from the balance
 * charge; the caller decides what that means.
 */
create function private.place_subscription_order(p_uid uuid, p_market text, p_address uuid, p_method text, p_subs uuid[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_addr     public.addresses;
  v_methods  text[];
  v_today    date := private.store_today(p_market);
  v_ok       uuid[] := '{}';
  v_line     record;
  v_pct      integer;
  v_sub      integer;
  v_disc     integer;
  v_t        record;
  v_order_id text;
begin
  select * into v_addr from public.addresses a where a.id = p_address and a.user_id = p_uid and a.market_id = p_market;
  if not found then
    raise exception 'address_not_found' using errcode = 'P0002';
  end if;
  select m.subscribe_methods into v_methods from public.markets m where m.id = p_market;
  if not (p_method = any (coalesce(v_methods, '{}'))) then
    raise exception 'payment_method_unavailable' using errcode = '22023';
  end if;

  -- lock in a stable order (deadlock-safe, as place_order does) and keep what can go
  for v_line in
    select s.id, s.qty, p.stock, p.archived_at, p.subscribe_save, p.max_per_customer, p.market_id
    from public.subscriptions s
    join public.products p on p.id = s.product_id
    where s.id = any (p_subs) and s.user_id = p_uid and s.status = 'active'
    order by p.id
    for update of p
  loop
    if v_line.archived_at is not null or not v_line.subscribe_save or v_line.max_per_customer is not null
       or v_line.market_id <> p_market then
      update public.subscriptions s set issue = 'unavailable', issue_on = v_today, updated_at = now() where s.id = v_line.id;
    elsif v_line.stock < v_line.qty then
      update public.subscriptions s set issue = 'out_of_stock', issue_on = v_today, updated_at = now() where s.id = v_line.id;
    else
      v_ok := v_ok || v_line.id;
    end if;
  end loop;
  if cardinality(v_ok) = 0 then
    return null;
  end if;

  v_pct := private.sns_pct(cardinality(v_ok));
  select coalesce(sum(p.price_minor * s.qty), 0)::integer,
         coalesce(sum(private.sns_unit_discount(p.price_minor, v_pct) * s.qty), 0)::integer
    into v_sub, v_disc
  from public.subscriptions s
  join public.products p on p.id = s.product_id
  where s.id = any (v_ok);
  -- tax as any order's; Subscribe & Save always delivers free
  select * into v_t from public.order_totals(p_market, v_sub - v_disc);

  v_order_id := private.new_order_id(p_market);
  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, discount_minor, ship_minor, tax_minor, total_minor,
    ship_name, ship_phone, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postcode,
    ship_instructions, from_cart, placed_at
  )
  values (
    v_order_id, p_uid, p_market, (select m.currency from public.markets m where m.id = p_market),
    'placed', p_method,
    case p_method
      when 'giftcard' then 'Amazon gift card balance'
      when 'upi' then 'UPI'
      when 'netbanking' then 'Net banking'
      when 'amazonpay' then 'Amazon Pay balance'
    end,
    v_sub, v_disc, 0, v_t.tax_minor, v_sub - v_disc + v_t.tax_minor,
    v_addr.full_name, v_addr.phone, v_addr.line1, v_addr.line2, v_addr.landmark, v_addr.city, v_addr.state, v_addr.postcode,
    v_addr.instructions, false, now()
  );

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty,
                                  unit_discount_minor, unit_sns_minor, subscription_id)
  select v_order_id, row_number() over (order by s.created_at, s.id), p.id, p.title, p.image, p.seller, p.price_minor, s.qty,
         private.sns_unit_discount(p.price_minor, v_pct), private.sns_unit_discount(p.price_minor, v_pct), s.id
  from public.subscriptions s
  join public.products p on p.id = s.product_id
  where s.id = any (v_ok);

  update public.products p
     set stock = p.stock - s.qty
    from public.subscriptions s
   where s.id = any (v_ok) and p.id = s.product_id;

  update public.subscriptions s
     set issue = null, issue_on = null, last_order_id = v_order_id, updated_at = now()
   where s.id = any (v_ok);

  return v_order_id;
end
$$;

revoke execute on function private.place_subscription_order(uuid, text, uuid, text, uuid[]) from public, anon, authenticated;

/**
 * Places the deliveries of a shopper's subscriptions in a store due on or before p_on (one order
 * per address and payment method), and moves each one on to its next date. A delivery that can't
 * be placed is skipped with the reason on its subscriptions. Returns the orders placed.
 */
create function private.deliver_subscriptions(p_uid uuid, p_market text, p_on date)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group  record;
  v_order  text;
  v_orders text[] := '{}';
  v_issue  text;
begin
  for v_group in
    select s.address_id, s.payment_method, array_agg(s.id order by s.created_at, s.id) as ids
    from public.subscriptions s
    where s.user_id = p_uid and s.market_id = p_market and s.status = 'active' and s.next_on <= p_on
    group by s.address_id, s.payment_method
  loop
    begin
      v_order := private.place_subscription_order(p_uid, p_market, v_group.address_id, v_group.payment_method, v_group.ids);
      if v_order is not null then
        v_orders := v_orders || v_order;
      end if;
    exception when others then
      v_issue := case sqlerrm
        when 'address_not_found' then 'address'
        when 'insufficient_balance' then 'payment'
        when 'payment_method_unavailable' then 'payment'
      end;
      if v_issue is null then
        raise;
      end if;
      update public.subscriptions s
         set issue = v_issue, issue_on = private.store_today(p_market), updated_at = now()
       where s.id = any (v_group.ids);
    end;
    update public.subscriptions s
       set next_on = private.sns_next_on(s.next_on, s.every_months, p_on), updated_at = now()
     where s.id = any (v_group.ids);
  end loop;
  return v_orders;
end
$$;

revoke execute on function private.deliver_subscriptions(uuid, text, date) from public, anon, authenticated;

/**
 * The store's run (pg_cron, hourly): every delivery due by today in each store's own date — or by
 * p_on, for tests. Returns how many orders it placed. Only the service role calls it.
 */
create function public.run_subscriptions(p_on date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due    record;
  v_placed integer := 0;
begin
  for v_due in
    select distinct s.user_id, s.market_id
    from public.subscriptions s
    where s.status = 'active' and s.next_on <= coalesce(p_on, private.store_today(s.market_id))
    order by s.user_id, s.market_id
  loop
    -- one shopper at a time, so their own changes and this run don't cross; one shopper's
    -- trouble doesn't hold up the others (theirs is tried again next run)
    begin
      perform pg_advisory_xact_lock(hashtext('subscriptions:' || v_due.user_id::text));
      v_placed := v_placed + cardinality(private.deliver_subscriptions(
        v_due.user_id, v_due.market_id, coalesce(p_on, private.store_today(v_due.market_id))));
    exception when others then
      raise warning 'subscribe & save: % in %: %', v_due.user_id, v_due.market_id, sqlerrm;
    end;
  end loop;
  return v_placed;
end
$$;

revoke execute on function public.run_subscriptions(date) from public, anon, authenticated;
grant execute on function public.run_subscriptions(date) to service_role;

-- ---------------------------------------------------------------------------
-- What shoppers do
-- ---------------------------------------------------------------------------

create function private.subscription_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(s) from public.subscriptions s where s.id = p_id
$$;

revoke execute on function private.subscription_json(uuid) from public, anon, authenticated;

-- the caller's active subscription, locked; subscription_not_found otherwise
create function private.my_subscription(p_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('subscriptions:' || auth.uid()::text));
  select * into v_sub from public.subscriptions s
   where s.id = p_id and s.user_id = auth.uid() and s.status = 'active'
   for update;
  if not found then
    raise exception 'subscription_not_found' using errcode = 'P0002';
  end if;
  return v_sub;
end
$$;

revoke execute on function private.my_subscription(uuid) from public, anon, authenticated;

/**
 * "Subscribe & Save → Set up now": subscribes the caller to a product, every p_every months
 * (1–6), p_qty (1–10) a delivery, to one of their addresses, paid with one of the store's
 * subscription methods — and places the first delivery now. Returns {subscription, order}.
 * Errors: product_not_found, subscribe_unavailable (the product can't be subscribed to),
 * already_subscribed, insufficient_stock, address_not_found, payment_method_unavailable,
 * insufficient_balance, invalid_input (detail qty / every_months).
 */
create function public.subscribe(p_market text, p_product text, p_qty integer, p_every integer, p_address uuid, p_payment_method text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_p     public.products;
  v_today date := private.store_today(p_market);
  v_id    uuid;
  v_order text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_qty is null or p_qty not between 1 and 10 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'qty';
  end if;
  if p_every is null or p_every not between 1 and 6 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'every_months';
  end if;
  perform pg_advisory_xact_lock(hashtext('subscriptions:' || v_uid::text));
  select * into v_p from public.products p where p.id = p_product and p.market_id = p_market;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if not v_p.subscribe_save or v_p.archived_at is not null or v_p.max_per_customer is not null then
    raise exception 'subscribe_unavailable' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.subscriptions s where s.user_id = v_uid and s.product_id = p_product and s.status = 'active') then
    raise exception 'already_subscribed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.addresses a where a.id = p_address and a.user_id = v_uid and a.market_id = p_market) then
    raise exception 'address_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.markets m where m.id = p_market and p_payment_method = any (m.subscribe_methods)) then
    raise exception 'payment_method_unavailable' using errcode = '22023';
  end if;

  insert into public.subscriptions (user_id, market_id, product_id, qty, every_months, next_on, address_id, payment_method)
  values (v_uid, p_market, p_product, p_qty, p_every, v_today, p_address, p_payment_method)
  returning id into v_id;

  v_order := private.place_subscription_order(v_uid, p_market, p_address, p_payment_method, array[v_id]);
  if v_order is null then
    raise exception 'insufficient_stock' using errcode = 'P0001', detail = p_product;
  end if;
  update public.subscriptions s set next_on = private.sns_next_on(v_today, p_every, v_today) where s.id = v_id;

  return jsonb_build_object('subscription', private.subscription_json(v_id), 'order', private.order_json(v_order));
end
$$;

revoke execute on function public.subscribe(text, text, integer, integer, uuid, text) from public, anon;
grant execute on function public.subscribe(text, text, integer, integer, uuid, text) to authenticated;

/**
 * Change a subscription: how many (1–10), how often (1–6 months), where it goes (one of the
 * caller's addresses in its store) and how it's paid; null keeps each as it is. A new frequency
 * counts from the next delivery's date.
 */
create function public.update_subscription(p_id uuid, p_qty integer default null, p_every integer default null,
                                           p_address uuid default null, p_payment_method text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions := private.my_subscription(p_id);
begin
  if p_qty is not null and p_qty not between 1 and 10 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'qty';
  end if;
  if p_every is not null and p_every not between 1 and 6 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'every_months';
  end if;
  if p_address is not null and not exists (
    select 1 from public.addresses a where a.id = p_address and a.user_id = v_sub.user_id and a.market_id = v_sub.market_id
  ) then
    raise exception 'address_not_found' using errcode = 'P0002';
  end if;
  if p_payment_method is not null and not exists (
    select 1 from public.markets m where m.id = v_sub.market_id and p_payment_method = any (m.subscribe_methods)
  ) then
    raise exception 'payment_method_unavailable' using errcode = '22023';
  end if;

  update public.subscriptions s
     set qty = coalesce(p_qty, s.qty),
         every_months = coalesce(p_every, s.every_months),
         address_id = coalesce(p_address, s.address_id),
         payment_method = coalesce(p_payment_method, s.payment_method),
         -- a fixed address or payment clears the reason the last one didn't go
         issue = case when (s.issue = 'address' and p_address is not null)
                        or (s.issue = 'payment' and p_payment_method is not null) then null else s.issue end,
         issue_on = case when (s.issue = 'address' and p_address is not null)
                           or (s.issue = 'payment' and p_payment_method is not null) then null else s.issue_on end,
         updated_at = now()
   where s.id = p_id;
  return private.subscription_json(p_id);
end
$$;

revoke execute on function public.update_subscription(uuid, integer, integer, uuid, text) from public, anon;
grant execute on function public.update_subscription(uuid, integer, integer, uuid, text) to authenticated;

-- "Skip": the next delivery doesn't go; the one after is next
create function public.skip_subscription(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions := private.my_subscription(p_id);
begin
  update public.subscriptions s
     set next_on = private.sns_next_on(s.next_on, s.every_months, s.next_on), updated_at = now()
   where s.id = p_id;
  return private.subscription_json(p_id);
end
$$;

revoke execute on function public.skip_subscription(uuid) from public, anon;
grant execute on function public.skip_subscription(uuid) to authenticated;

create function public.cancel_subscription(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions := private.my_subscription(p_id);
begin
  update public.subscriptions s
     set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where s.id = p_id;
  return private.subscription_json(p_id);
end
$$;

revoke execute on function public.cancel_subscription(uuid) from public, anon;
grant execute on function public.cancel_subscription(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The catalog views (as in 20261221090000_seller_offers) gain subscribe_save, last
-- ---------------------------------------------------------------------------
create or replace view public.catalog_products_all
with (security_invoker = true)
as
select
  p.id,
  p.market_id,
  m.currency,
  p.category_slug,
  c.name as category_name,
  p.title,
  p.brand,
  p.image,
  p.price_minor,
  p.list_minor,
  p.deal_pct,
  p.deal,
  p.badge,
  p.bought_past_month,
  p.seller,
  p.ships_from,
  p.bullets,
  p.stock,
  p.position,
  coalesce(round(r.rating_sum / nullif(r.rating_count, 0), 1), 0)::numeric(2, 1) as rating,
  coalesce(r.rating_count, 0) as review_count,
  case p.badge
    when 'Amazon''s Choice' then 0
    when 'Best Seller' then 1
    when 'Overall Pick' then 2
    else 3
  end as badge_rank,
  p.archived_at,
  p.variant_group,
  p.variant_axis,
  p.variant_label,
  p.max_per_customer,
  p.sizes,
  p.unit_qty,
  p.unit_kind,
  p.qty_discount_pct,
  p.qty_discount_min,
  p.release_at,
  p.offer_of,
  p.condition,
  p.condition_note,
  -- what can be subscribed to: a product limited per customer can't be
  p.subscribe_save and p.max_per_customer is null as subscribe_save
from public.products p
join public.markets m on m.id = p.market_id
join public.categories c on c.slug = p.category_slug
-- an offer is rated as its product: reviews are the product's, whoever sold it
left join public.product_ratings r on r.product_id = coalesce(p.offer_of, p.id);

create or replace view public.catalog_products
with (security_invoker = true)
as
select
  id, market_id, currency, category_slug, category_name, title, brand, image,
  price_minor, list_minor, deal_pct, deal, badge, bought_past_month, seller,
  ships_from, bullets, stock, position, rating, review_count, badge_rank,
  variant_group, variant_axis, variant_label, max_per_customer, sizes,
  unit_qty, unit_kind, qty_discount_pct, qty_discount_min, release_at, subscribe_save
from public.catalog_products_all
where archived_at is null and offer_of is null;

-- ---------------------------------------------------------------------------
-- The hourly run
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('subscribe-save-deliveries', '7 * * * *', 'select public.run_subscriptions()');
