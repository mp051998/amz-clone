-- ===========================================================================
-- Returns: shoppers return delivered items within the store's window; admins
-- receive them (stock back, refund issued) or reject them
-- ===========================================================================
-- A return covers some or all of an order's items (any quantity still not
-- returned). It starts 'requested' with a drop-off code; the shopper can cancel
-- it until the store receives it. Receiving puts the stock back and refunds:
-- card payments through Stripe (refund_status 'pending' until the server has
-- asked), the other (simulated) methods and cash on delivery at once.
--
-- The refund is the items, their share of the order's tax, and, when the
-- store got it wrong (damaged, defective, wrong or incomplete item, not as
-- described), their share of the delivery charge. The last return of an
-- order's items gets whatever tax is left, so the shares add up exactly.

alter table public.markets
  add column return_days integer not null default 30 check (return_days between 1 and 365);
update public.markets set return_days = case id when 'IN' then 10 else 30 end;

create table public.returns (
  id               uuid primary key default gen_random_uuid(),
  order_id         text not null references public.orders (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'requested' check (status in ('requested', 'received', 'rejected', 'cancelled')),
  reason           text not null check (reason in (
                     'no_longer_needed', 'bought_by_mistake', 'better_price',
                     'damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described')),
  comment          text check (char_length(comment) <= 1000),
  items_minor      integer not null check (items_minor >= 0),
  tax_minor        integer not null check (tax_minor >= 0),
  ship_minor       integer not null check (ship_minor >= 0),
  refund_minor     integer generated always as (items_minor + tax_minor + ship_minor) stored,
  refund_status    text check (refund_status in ('pending', 'succeeded', 'failed')),
  stripe_refund_id text,
  refunded_at      timestamptz,
  dropoff_code     text not null,
  dropoff_by       timestamptz not null,
  reject_note      text check (char_length(reject_note) <= 500),
  created_at       timestamptz not null default now(),
  received_at      timestamptz,
  rejected_at      timestamptz,
  cancelled_at     timestamptz,
  constraint returns_refund_once_received check ((status = 'received') = (refund_status is not null))
);

create index returns_order_idx on public.returns (order_id, created_at);
create index returns_open_idx on public.returns (created_at) where status = 'requested';

create table public.return_items (
  return_id  uuid not null references public.returns (id) on delete cascade,
  order_id   text not null,
  product_id text not null,
  qty        integer not null check (qty > 0),
  primary key (return_id, product_id),
  foreign key (order_id, product_id) references public.order_items (order_id, product_id) on delete cascade
);

alter table public.returns enable row level security;
alter table public.return_items enable row level security;

create policy "own returns" on public.returns
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own return items" on public.return_items
  for select to authenticated using (
    exists (select 1 from public.returns r where r.id = return_id and r.user_id = (select auth.uid()))
  );

revoke insert, update, delete, truncate on public.returns, public.return_items from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shoppers
-- ---------------------------------------------------------------------------

create function private.return_json(p_return_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'order_id', r.order_id, 'status', r.status, 'reason', r.reason, 'comment', r.comment,
    'items_minor', r.items_minor, 'tax_minor', r.tax_minor, 'ship_minor', r.ship_minor, 'refund_minor', r.refund_minor,
    'refund_status', r.refund_status, 'refunded_at', r.refunded_at,
    'dropoff_code', r.dropoff_code, 'dropoff_by', r.dropoff_by, 'reject_note', r.reject_note,
    'created_at', r.created_at, 'received_at', r.received_at, 'rejected_at', r.rejected_at, 'cancelled_at', r.cancelled_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', ri.product_id, 'qty', ri.qty,
               'title', oi.title, 'image', oi.image, 'unit_price_minor', oi.unit_price_minor
             ) order by oi.line_no)
      from public.return_items ri
      join public.order_items oi on oi.order_id = ri.order_id and oi.product_id = ri.product_id
      where ri.return_id = r.id
    ), '[]'::jsonb)
  )
  from public.returns r
  where r.id = p_return_id
$$;

/**
 * Start a return of delivered items. p_items: [{product_id, qty}] (lines with
 * qty 0 are skipped; a product listed twice adds up). Raises
 * return_not_allowed (detail not_delivered | window_closed) and invalid_input
 * (detail reason | comment | items: nothing picked, not in the order, or more
 * than is left to return).
 */
create function public.request_return(p_order_id text, p_items jsonb, p_reason text, p_comment text default null)
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

  select o.id, o.status, o.delivered_at, o.subtotal_minor, o.tax_minor, o.ship_minor, m.return_days
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
    select oi.product_id, oi.unit_price_minor,
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
         coalesce(sum(q.qty * a.unit_price_minor), 0)::integer,
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
    else least(round(v_o.tax_minor::numeric * v_items / nullif(v_o.subtotal_minor, 0))::integer, v_o.tax_minor - v_prior_tax)
  end;
  v_ship := case
    when p_reason in ('damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described') then
      least(round(v_o.ship_minor::numeric * v_items / nullif(v_o.subtotal_minor, 0))::integer, v_o.ship_minor - v_prior_ship)
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

/**
 * The returns side of one of the caller's orders: its returns (newest first),
 * the last moment to start one (null until delivered), and how many of each item
 * are still returnable. Null when the order isn't the caller's.
 */
create function public.order_returns(p_order_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'delivered', o.status = 'placed' and o.delivered_at is not null and o.delivered_at <= now(),
    'return_by', case when o.status = 'placed' and o.delivered_at <= now()
                      then o.delivered_at + make_interval(days => m.return_days) end,
    'returnable', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', oi.product_id,
               'qty', oi.qty - coalesce((
                 select sum(ri.qty) from public.return_items ri
                 join public.returns r on r.id = ri.return_id
                 where ri.order_id = oi.order_id and ri.product_id = oi.product_id and r.status in ('requested', 'received')
               ), 0)
             ) order by oi.line_no)
      from public.order_items oi
      where oi.order_id = o.id
    ), '[]'::jsonb),
    'returns', coalesce((
      select jsonb_agg(private.return_json(r.id) order by r.created_at desc)
      from public.returns r
      where r.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.markets m on m.id = o.market_id
  where o.id = p_order_id and o.user_id = (select auth.uid())
$$;

/** Call off a return the store hasn't received yet (409 return_not_open after). */
create function public.cancel_my_return(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.returns r
     set status = 'cancelled', cancelled_at = now()
   where r.id = p_return_id and r.user_id = auth.uid() and r.status = 'requested';
  if not found then
    if exists (select 1 from public.returns r where r.id = p_return_id and r.user_id = auth.uid()) then
      raise exception 'return_not_open' using errcode = 'P0001';
    end if;
    raise exception 'return_not_found' using errcode = 'P0002';
  end if;
  return private.return_json(p_return_id);
end
$$;

-- ---------------------------------------------------------------------------
-- Store admins
-- ---------------------------------------------------------------------------

create function private.admin_return_json(p_return_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.return_json(r.id) || jsonb_build_object(
    'stripe_refund_id', r.stripe_refund_id,
    'order', jsonb_build_object(
      'id', o.id, 'market_id', o.market_id, 'currency', o.currency, 'payment_method', o.payment_method,
      'payment_label', o.payment_label, 'total_minor', o.total_minor, 'delivered_at', o.delivered_at
    ),
    'customer', jsonb_build_object('id', o.user_id, 'email', u.email, 'name', pr.display_name)
  )
  from public.returns r
  join public.orders o on o.id = r.order_id
  left join auth.users u on u.id = o.user_id
  left join public.profiles pr on pr.id = o.user_id
  where r.id = p_return_id
$$;

-- One store's returns. filter: open (waiting to be received) | refund_issues
-- (received, refund pending or failed) | closed (refunded, rejected or
-- cancelled) | all. Open ones oldest first (drop-off order), the rest newest.
create function public.admin_list_returns(
  p_market    text,
  p_filter    text default 'open',
  p_page      integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_filter text := coalesce(p_filter, 'open');
  v_size   integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_page   integer := greatest(coalesce(p_page, 1), 1);
  v_out    jsonb;
begin
  perform private.require_admin();
  if v_filter not in ('open', 'refund_issues', 'closed', 'all') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'filter';
  end if;

  with base as (
    select r.id, r.status, r.refund_status, r.created_at
    from public.returns r
    join public.orders o on o.id = r.order_id
    where o.market_id = p_market
  ),
  hit as (
    select b.* from base b
    where v_filter = 'all'
       or (v_filter = 'open' and b.status = 'requested')
       or (v_filter = 'refund_issues' and b.refund_status in ('pending', 'failed'))
       or (v_filter = 'closed' and (b.status in ('rejected', 'cancelled') or b.refund_status = 'succeeded'))
  ),
  page as (
    select h.id, h.created_at from hit h
    order by
      case when v_filter = 'open' then h.created_at end asc,
      h.created_at desc,
      h.id
    limit v_size offset (v_page - 1) * v_size
  )
  select jsonb_build_object(
    'returns', coalesce((
      select jsonb_agg(private.admin_return_json(pg.id)
                       order by case when v_filter = 'open' then pg.created_at end asc, pg.created_at desc, pg.id)
      from page pg
    ), '[]'::jsonb),
    'total', (select count(*) from hit),
    'page', v_page,
    'page_size', v_size,
    'counts', (
      select jsonb_build_object(
        'open', count(*) filter (where status = 'requested'),
        'refund_issues', count(*) filter (where refund_status in ('pending', 'failed')),
        'closed', count(*) filter (where status in ('rejected', 'cancelled') or refund_status = 'succeeded'),
        'all', count(*)
      ) from base
    )
  ) into v_out;
  return v_out;
end
$$;

create function public.admin_get_return(p_return_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.require_admin();
  v := private.admin_return_json(p_return_id);
  if v is null then
    raise exception 'return_not_found' using errcode = 'P0002';
  end if;
  return v;
end
$$;

-- The items are back: stock returns and the refund starts (card: pending until
-- the server asks Stripe; everything else: refunded now).
create function public.admin_receive_return(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method text;
begin
  perform private.require_admin();
  select o.payment_method into v_method
  from public.returns r
  join public.orders o on o.id = r.order_id
  where r.id = p_return_id
  for update of r;
  if not found then
    raise exception 'return_not_found' using errcode = 'P0002';
  end if;

  update public.returns r
     set status = 'received',
         received_at = now(),
         refund_status = case when v_method = 'card' and r.refund_minor > 0 then 'pending' else 'succeeded' end,
         refunded_at = case when v_method = 'card' and r.refund_minor > 0 then null else now() end
   where r.id = p_return_id and r.status = 'requested';
  if not found then
    raise exception 'return_not_open' using errcode = 'P0001';
  end if;

  update public.products p
     set stock = p.stock + ri.qty
    from public.return_items ri
   where ri.return_id = p_return_id and p.id = ri.product_id;

  return private.admin_return_json(p_return_id);
end
$$;

create function public.admin_reject_return(p_return_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_admin();
  if char_length(v_note) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  update public.returns r
     set status = 'rejected', rejected_at = now(), reject_note = v_note
   where r.id = p_return_id and r.status = 'requested';
  if not found then
    if exists (select 1 from public.returns r where r.id = p_return_id) then
      raise exception 'return_not_open' using errcode = 'P0001';
    end if;
    raise exception 'return_not_found' using errcode = 'P0002';
  end if;
  return private.admin_return_json(p_return_id);
end
$$;

-- Stripe's word on a return's refund (server only). Same guards as
-- record_refund: a late 'pending' never overwrites 'succeeded', and a failure
-- for some older refund than the one on record is ignored.
create function public.record_return_refund(p_return_id uuid, p_refund_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'succeeded', 'failed') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  update public.returns r
     set stripe_refund_id = coalesce(p_refund_id, r.stripe_refund_id),
         refund_status = p_status,
         refunded_at = case when p_status = 'succeeded' then coalesce(r.refunded_at, now()) end
   where r.id = p_return_id
     and r.status = 'received'
     and not (r.refund_status = 'succeeded' and p_status = 'pending')
     and not (p_status = 'failed' and p_refund_id is not null and r.stripe_refund_id is not null
              and r.stripe_refund_id <> p_refund_id);
end
$$;

revoke execute on function private.return_json(uuid) from public, anon, authenticated;
revoke execute on function private.admin_return_json(uuid) from public, anon, authenticated;
revoke execute on function public.request_return(text, jsonb, text, text) from public, anon;
revoke execute on function public.cancel_my_return(uuid) from public, anon;
revoke execute on function public.order_returns(text) from public, anon;
revoke execute on function public.admin_list_returns(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_get_return(uuid) from public, anon;
revoke execute on function public.admin_receive_return(uuid) from public, anon;
revoke execute on function public.admin_reject_return(uuid, text) from public, anon;
revoke execute on function public.record_return_refund(uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_return(text, jsonb, text, text) to authenticated;
grant execute on function public.cancel_my_return(uuid) to authenticated;
grant execute on function public.order_returns(text) to authenticated;
grant execute on function public.admin_list_returns(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_get_return(uuid) to authenticated, service_role;
grant execute on function public.admin_receive_return(uuid) to authenticated, service_role;
grant execute on function public.admin_reject_return(uuid, text) to authenticated, service_role;
grant execute on function public.record_return_refund(uuid, text, text) to service_role;
