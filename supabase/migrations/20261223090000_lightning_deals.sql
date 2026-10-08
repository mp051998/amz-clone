/*
 * Lightning Deals, as on Amazon: a product's price drops for a few hours, for so many units
 * ("Lightning Deal · 47% claimed · Ends in 2:13:45"). When the time is up or the units are gone,
 * the price goes back.
 *
 * A deal is planned ahead (upcoming), goes live at its start, and ends at its end, when it sells
 * out, or early if the product goes off sale, runs out of stock or is repriced by an admin. While
 * it's live the product itself carries the deal price (with what it cost before as the struck
 * price), so carts, checkout, coupons and every listing price it as they price anything else.
 * Every unit ordered at the deal price is claimed against it.
 *
 * The store runs them by itself (pg_cron): each minute, deals due to start or end do; each hour,
 * a couple more are planned per store to start two hours later, six hours long.
 */

create table public.lightning_deals (
  id               uuid primary key default gen_random_uuid(),
  product_id       text not null references public.products (id) on delete cascade,
  market_id        text not null references public.markets (id),
  deal_price_minor integer not null check (deal_price_minor > 0),
  quota            integer not null check (quota > 0),
  claimed          integer not null default 0 check (claimed >= 0),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  -- set as it goes live: the product's price before, put back when it ends
  started_at       timestamptz,
  was_price_minor  integer,
  was_list_minor   integer,
  was_deal_pct     integer,
  was_deal         boolean,
  ended_at         timestamptz,
  -- time: its end came; sold_out: every unit claimed; repriced: an admin changed the price, or it
  -- was no longer below the price when it was to start; unavailable: off sale or out of stock
  end_reason       text check (end_reason in ('time', 'sold_out', 'repriced', 'unavailable')),
  created_at       timestamptz not null default now(),
  constraint lightning_deals_window check (ends_at > starts_at and ends_at - starts_at <= interval '12 hours'),
  constraint lightning_deals_ended check ((ended_at is null) = (end_reason is null))
);

-- one live deal per product
create unique index lightning_deals_live_product on public.lightning_deals (product_id)
  where started_at is not null and ended_at is null;
create index lightning_deals_open on public.lightning_deals (market_id, starts_at) where ended_at is null;
create index lightning_deals_product on public.lightning_deals (product_id, ends_at);

alter table public.lightning_deals enable row level security;

-- deals are public, like the prices they set
create policy "anyone reads lightning deals" on public.lightning_deals
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.lightning_deals from anon, authenticated;

-- A deal is for a product on sale on its own (not another seller's offer), below its price, and
-- doesn't overlap another of its deals.
create function private.lightning_deals_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  select * into v_product from public.products p where p.id = new.product_id;
  if not found or v_product.offer_of is not null or v_product.archived_at is not null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'product_id';
  end if;
  if new.deal_price_minor >= v_product.price_minor then
    raise exception 'invalid_input' using errcode = '22023', detail = 'deal_price_minor';
  end if;
  if exists (
    select 1 from public.lightning_deals d
     where d.product_id = new.product_id and d.ended_at is null
       and d.starts_at < new.ends_at and new.starts_at < d.ends_at
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'starts_at';
  end if;
  new.market_id := v_product.market_id;
  new.claimed := 0;
  new.started_at := null;
  new.ended_at := null;
  new.end_reason := null;
  return new;
end
$$;

revoke execute on function private.lightning_deals_before_insert() from public, anon, authenticated;

create trigger lightning_deals_before_insert
  before insert on public.lightning_deals
  for each row execute function private.lightning_deals_before_insert();

-- ---------------------------------------------------------------------------
-- Going live and ending
-- ---------------------------------------------------------------------------

/**
 * Put a deal live: the product takes the deal price, struck against its list price (or the price
 * it had, when that's higher or there's none). A deal whose product is off sale, out of stock or
 * not yet released ends as unavailable instead; one no longer below the price ends as repriced.
 */
create function private.start_lightning_deal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal public.lightning_deals;
  v_product public.products;
  v_list integer;
begin
  select * into v_deal from public.lightning_deals d where d.id = p_id for update;
  if not found or v_deal.started_at is not null or v_deal.ended_at is not null then
    return;
  end if;
  select * into v_product from public.products p where p.id = v_deal.product_id for update;
  if v_product.archived_at is not null or v_product.stock <= 0
     or (v_product.release_at is not null and v_product.release_at > now()) then
    update public.lightning_deals set ended_at = now(), end_reason = 'unavailable' where id = p_id;
    return;
  end if;
  if v_deal.deal_price_minor >= v_product.price_minor then
    update public.lightning_deals set ended_at = now(), end_reason = 'repriced' where id = p_id;
    return;
  end if;
  v_list := greatest(coalesce(v_product.list_minor, v_product.price_minor), v_product.price_minor);
  perform set_config('app.lightning_deal', 'on', true);
  update public.products
     set price_minor = v_deal.deal_price_minor,
         list_minor = v_list,
         deal = true,
         deal_pct = least(99, greatest(1, round((v_list - v_deal.deal_price_minor) * 100.0 / v_list)))::integer
   where id = v_product.id;
  perform set_config('app.lightning_deal', '', true);
  update public.lightning_deals
     set started_at = now(),
         was_price_minor = v_product.price_minor,
         was_list_minor = v_product.list_minor,
         was_deal_pct = v_product.deal_pct,
         was_deal = v_product.deal
   where id = p_id;
end
$$;

/**
 * End a deal (p_reason as in end_reason). A live one puts the product's price back, unless
 * something else has repriced it since.
 */
create function private.end_lightning_deal(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal public.lightning_deals;
begin
  select * into v_deal from public.lightning_deals d where d.id = p_id for update;
  if not found or v_deal.ended_at is not null then
    return;
  end if;
  if v_deal.started_at is not null then
    perform set_config('app.lightning_deal', 'on', true);
    update public.products
       set price_minor = v_deal.was_price_minor,
           list_minor = v_deal.was_list_minor,
           deal_pct = v_deal.was_deal_pct,
           deal = v_deal.was_deal
     where id = v_deal.product_id and price_minor = v_deal.deal_price_minor;
    perform set_config('app.lightning_deal', '', true);
  end if;
  update public.lightning_deals set ended_at = now(), end_reason = p_reason where id = p_id;
end
$$;

revoke execute on function private.start_lightning_deal(uuid) from public, anon, authenticated;
revoke execute on function private.end_lightning_deal(uuid, text) from public, anon, authenticated;

-- An admin repricing a product mid-deal ends the deal; their price stands.
create function private.products_lightning_repriced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.lightning_deal', true), '') <> 'on' then
    update public.lightning_deals
       set ended_at = now(), end_reason = 'repriced'
     where product_id = new.id and started_at is not null and ended_at is null;
  end if;
  return null;
end
$$;

revoke execute on function private.products_lightning_repriced() from public, anon, authenticated;

create trigger products_lightning_repriced
  after update of price_minor on public.products
  for each row
  when (old.price_minor is distinct from new.price_minor)
  execute function private.products_lightning_repriced();

-- ---------------------------------------------------------------------------
-- Claiming: every unit ordered at the deal price while it's live; the last one ends it
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column lightning_deal_id uuid references public.lightning_deals (id) on delete set null;

create function private.order_items_claim_lightning_deal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal public.lightning_deals;
begin
  update public.lightning_deals d
     set claimed = d.claimed + new.qty
   where d.product_id = new.product_id and d.started_at is not null and d.ended_at is null
     and d.deal_price_minor = new.unit_price_minor
  returning d.* into v_deal;
  if found then
    new.lightning_deal_id := v_deal.id;
    if v_deal.claimed >= v_deal.quota then
      perform private.end_lightning_deal(v_deal.id, 'sold_out');
    end if;
  end if;
  return new;
end
$$;

revoke execute on function private.order_items_claim_lightning_deal() from public, anon, authenticated;

create trigger order_items_claim_lightning_deal
  before insert on public.order_items
  for each row execute function private.order_items_claim_lightning_deal();

-- ---------------------------------------------------------------------------
-- The store's runs
-- ---------------------------------------------------------------------------

/**
 * Each minute: end live deals whose time is up (or whose product went off sale or ran out), drop
 * upcoming ones whose window passed, and put live the ones due. Returns how many changed.
 */
create function public.tick_lightning_deals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal record;
  v_n integer := 0;
begin
  for v_deal in
    select d.id,
           case when d.ends_at <= now() then 'time' else 'unavailable' end as reason
      from public.lightning_deals d
      join public.products p on p.id = d.product_id
     where d.started_at is not null and d.ended_at is null
       and (d.ends_at <= now() or p.archived_at is not null or p.stock <= 0)
  loop
    perform private.end_lightning_deal(v_deal.id, v_deal.reason);
    v_n := v_n + 1;
  end loop;

  update public.lightning_deals
     set ended_at = now(), end_reason = 'time'
   where started_at is null and ended_at is null and ends_at <= now();

  for v_deal in
    select d.id from public.lightning_deals d
     where d.started_at is null and d.ended_at is null and d.starts_at <= now() and d.ends_at > now()
     order by d.starts_at
  loop
    perform private.start_lightning_deal(v_deal.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

/**
 * Each hour: two deals per store starting at p_slot (default: the hour after next), six hours
 * long, on products on sale, in stock, not already a deal and with no deal of their own then;
 * 15–40% off (whole rupees in India), for a third of the stock, 5 to 100 units. Returns how many
 * were planned.
 */
create function public.plan_lightning_deals(p_slot timestamptz default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot timestamptz := coalesce(p_slot, date_trunc('hour', now()) + interval '2 hours');
  v_end timestamptz := v_slot + interval '6 hours';
  v_market public.markets;
  v_product record;
  v_have integer;
  v_pct integer;
  v_price integer;
  v_n integer := 0;
begin
  for v_market in select * from public.markets order by id loop
    select count(*) into v_have from public.lightning_deals d
     where d.market_id = v_market.id and d.starts_at = v_slot;
    for v_product in
      select p.id, p.price_minor, p.stock
        from public.products p
       where p.market_id = v_market.id
         and p.offer_of is null and p.archived_at is null and not p.deal
         and p.stock >= 15 and p.price_minor >= 1000
         and (p.release_at is null or p.release_at <= now())
         and not exists (
           select 1 from public.lightning_deals d
            where d.product_id = p.id and d.ended_at is null and d.starts_at < v_end and v_slot < d.ends_at
         )
       order by random()
       limit greatest(0, 2 - v_have)
    loop
      v_pct := 15 + 5 * floor(random() * 6)::integer;
      v_price := round(v_product.price_minor * (100 - v_pct) / 100.0)::integer;
      if v_market.currency = 'INR' then
        v_price := (round(v_price / 100.0) * 100)::integer;
      end if;
      if v_price > 0 and v_price < v_product.price_minor then
        insert into public.lightning_deals (product_id, market_id, deal_price_minor, quota, starts_at, ends_at)
        values (v_product.id, v_market.id, v_price, least(100, greatest(5, v_product.stock / 3)), v_slot, v_end);
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end
$$;

revoke execute on function public.tick_lightning_deals() from public, anon, authenticated;
revoke execute on function public.plan_lightning_deals(timestamptz) from public, anon, authenticated;
grant execute on function public.tick_lightning_deals() to service_role;
grant execute on function public.plan_lightning_deals(timestamptz) to service_role;

-- A store with products already gets the hours that have started, and the next two, straight
-- away (a fresh database has none yet; its seed comes after, and the hourly plan fills in).
do $$
declare
  v_h integer;
begin
  for v_h in -5..2 loop
    perform public.plan_lightning_deals(date_trunc('hour', now()) + make_interval(hours => v_h));
  end loop;
  perform public.tick_lightning_deals();
end
$$;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('lightning-deals-tick', '* * * * *', 'select public.tick_lightning_deals()');
select cron.schedule('lightning-deals-plan', '13 * * * *', 'select public.plan_lightning_deals()');
