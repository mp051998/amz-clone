-- Returning an item cancels the protection plan bought with it, as on Amazon:
-- a refund return gives back the returned units' plans with them
-- (`returns.protection_minor`, inside `refund_minor`), once the items reach
-- the store like the rest of the refund. A replacement keeps the plan (the
-- shopper still has the item), so it refunds nothing, as before.

alter table public.returns
  add column protection_minor integer not null default 0 check (protection_minor >= 0);
alter table public.returns drop constraint returns_replacement_free;
alter table public.returns add constraint returns_replacement_free check (
  resolution = 'refund' or (items_minor = 0 and tax_minor = 0 and ship_minor = 0 and protection_minor = 0)
);
alter table public.returns
  alter column refund_minor set expression as (items_minor + tax_minor + ship_minor + protection_minor);

-- ---------------------------------------------------------------------------
-- JSON (as in 20261116090000_replacement_returns): the plans refunded
-- ---------------------------------------------------------------------------
create or replace function private.return_json(p_return_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'order_id', r.order_id, 'status', r.status, 'reason', r.reason, 'comment', r.comment,
    'resolution', r.resolution,
    'replacement_shipped_at', r.replacement_shipped_at, 'replacement_delivered_at', r.replacement_delivered_at,
    'items_minor', r.items_minor, 'tax_minor', r.tax_minor, 'ship_minor', r.ship_minor, 'protection_minor', r.protection_minor,
    'refund_minor', r.refund_minor,
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

-- ---------------------------------------------------------------------------
-- request_return (as in 20261116090000_replacement_returns): a refund return
-- also prices the returned units' protection plans
-- ---------------------------------------------------------------------------
create or replace function public.request_return(
  p_order_id   text,
  p_items      jsonb,
  p_reason     text,
  p_comment    text default null,
  p_resolution text default 'refund'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_comment    text := nullif(btrim(coalesce(p_comment, '')), '');
  v_resolution text := coalesce(p_resolution, 'refund');
  v_fault      boolean := p_reason in ('damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described');
  v_o          record;
  v_lines      integer;
  v_ok         integer;
  v_fresh      integer;
  v_items      integer;
  v_prot       integer := 0;
  v_left       integer;
  v_prior_tax  integer;
  v_prior_ship integer;
  v_tax        integer := 0;
  v_ship       integer := 0;
  v_line       record;
  v_shipped    timestamptz;
  v_delivered  timestamptz;
  v_code       text := upper(md5(gen_random_uuid()::text));
  v_id         uuid;
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
  if v_resolution not in ('refund', 'replacement') or (v_resolution = 'replacement' and not v_fault) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'resolution';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;

  select o.id, o.status, o.delivered_at, o.subtotal_minor - o.discount_minor as paid_minor, o.tax_minor, o.ship_minor,
         m.return_days, m.time_zone
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

  -- what's asked for, per product, against what's still returnable (refund
  -- returns only: replaced units were swapped, not given back) and what hasn't
  -- been replaced yet
  with req as (
    select x.product_id, sum(x.qty)::integer as qty
    from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
    where x.qty > 0
    group by x.product_id
  ),
  avail as (
    select oi.product_id, oi.unit_price_minor - oi.unit_discount_minor as unit_paid_minor, oi.protection_minor as unit_plan_minor,
           oi.qty - coalesce((
             select sum(ri.qty) from public.return_items ri
             join public.returns r on r.id = ri.return_id
             where ri.order_id = oi.order_id and ri.product_id = oi.product_id
               and r.status in ('requested', 'received') and r.resolution = 'refund'
           ), 0) as left_qty,
           oi.qty - coalesce((
             select sum(ri.qty) from public.return_items ri
             join public.returns r on r.id = ri.return_id
             where ri.order_id = oi.order_id and ri.product_id = oi.product_id
               and r.status in ('requested', 'received') and r.resolution = 'replacement'
           ), 0) as unreplaced_qty
    from public.order_items oi
    where oi.order_id = p_order_id
  )
  select count(*)::integer,
         count(*) filter (where a.left_qty >= q.qty)::integer,
         count(*) filter (where a.unreplaced_qty >= q.qty)::integer,
         coalesce(sum(q.qty * a.unit_paid_minor), 0)::integer,
         (select coalesce(sum(a2.left_qty), 0) from avail a2)::integer - coalesce(sum(q.qty), 0)::integer,
         coalesce(sum(q.qty * a.unit_plan_minor), 0)::integer
    into v_lines, v_ok, v_fresh, v_items, v_left, v_prot
  from req q
  left join avail a on a.product_id = q.product_id;
  if v_lines = 0 or v_ok <> v_lines then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;

  if v_resolution = 'replacement' then
    if v_fresh <> v_lines then
      raise exception 'replacement_unavailable' using errcode = 'P0001', detail = 'already_replaced';
    end if;
    -- the new units come out of stock now, product by product in a stable order
    for v_line in
      select x.product_id, sum(x.qty)::integer as qty
      from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
      where x.qty > 0
      group by x.product_id
      order by x.product_id
    loop
      update public.products p set stock = p.stock - v_line.qty
       where p.id = v_line.product_id and p.archived_at is null and p.stock >= v_line.qty;
      if not found then
        raise exception 'replacement_unavailable' using errcode = 'P0001', detail = 'out_of_stock';
      end if;
    end loop;
    v_items := 0;
    v_prot := 0;
    v_shipped := now() + interval '10 hours';
    select d.delivered into v_delivered from private.delivery_after(v_shipped, coalesce(v_o.time_zone, 'UTC')) d;
  else
    select coalesce(sum(r.tax_minor), 0), coalesce(sum(r.ship_minor), 0)
      into v_prior_tax, v_prior_ship
    from public.returns r
    where r.order_id = p_order_id and r.status in ('requested', 'received');

    v_tax := case
      when v_left = 0 then v_o.tax_minor - v_prior_tax
      else least(round(v_o.tax_minor::numeric * v_items / nullif(v_o.paid_minor, 0))::integer, v_o.tax_minor - v_prior_tax)
    end;
    v_ship := case
      when v_fault then
        least(round(v_o.ship_minor::numeric * v_items / nullif(v_o.paid_minor, 0))::integer, v_o.ship_minor - v_prior_ship)
      else 0
    end;
  end if;

  insert into public.returns (order_id, user_id, reason, comment, resolution, items_minor, tax_minor, ship_minor, protection_minor,
                              dropoff_code, dropoff_by, replacement_shipped_at, replacement_delivered_at)
  values (p_order_id, v_uid, p_reason, v_comment, v_resolution, v_items,
          greatest(coalesce(v_tax, 0), 0), greatest(coalesce(v_ship, 0), 0), v_prot,
          substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), now() + interval '14 days', v_shipped, v_delivered)
  returning id into v_id;

  insert into public.return_items (return_id, order_id, product_id, qty)
  select v_id, p_order_id, x.product_id, sum(x.qty)::integer
  from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
  where x.qty > 0
  group by x.product_id;

  return private.return_json(v_id);
end
$$;
