-- Size exchanges, as Amazon's "Exchange for a different size": clothes or shoes that are too small
-- or too large go back and the store sends the same item in the size the shopper picks, at no
-- charge, right away, like a replacement.
--
-- - returns.reason gains too_small and too_large ("Too small", "Too large"): not the store's fault,
--   so a refund for one doesn't refund the delivery.
-- - return_items.size: the size a replacement is sent in, when it isn't the one ordered (null: the
--   same item again).
-- - request_return() (as in 20270103090000_replacement_only.sql): p_items take an optional size,
--   on a replacement only, one the product comes in. A replacement for too_small or too_large is
--   an exchange: every item in a size other than the one ordered (invalid_input, detail size,
--   otherwise). Everything else about a replacement holds: once per unit, out of stock now, its own
--   window from its delivery.
-- - private.return_json() (as in 20270104090000_split_payment.sql): each item's exchange_size.

alter table public.returns drop constraint returns_reason_check;
alter table public.returns add constraint returns_reason_check check (reason in (
  'no_longer_needed', 'bought_by_mistake', 'better_price', 'too_small', 'too_large',
  'damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described', 'not_received', 'atoz_claim'));

alter table public.return_items
  add column size text check (char_length(size) between 1 and 12);

create or replace function public.request_return(
  p_order_id   text,
  p_items      jsonb,
  p_reason     text,
  p_comment    text default null,
  p_resolution text default 'refund',
  p_refund_to  text default 'original'
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
  v_refund_to  text := coalesce(p_refund_to, 'original');
  v_fault      boolean := p_reason in ('damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described');
  v_sized      boolean := p_reason in ('too_small', 'too_large');
  v_o          record;
  v_lines      integer;
  v_ok         integer;
  v_open       integer;
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
  if p_reason is null or p_reason not in ('no_longer_needed', 'bought_by_mistake', 'better_price', 'too_small', 'too_large',
      'damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  if char_length(v_comment) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'comment';
  end if;
  if v_resolution not in ('refund', 'replacement') or (v_resolution = 'replacement' and not v_fault and not v_sized) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'resolution';
  end if;
  if v_refund_to not in ('original', 'balance') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'refund_to';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;

  -- sizes: only on a replacement, one per product, one the product comes in; a replacement for a
  -- size that didn't fit is an exchange, every item in a size other than the one ordered
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id text, qty integer, size text)
    where x.qty > 0 and x.size is not null
  ) and v_resolution <> 'replacement' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'size';
  end if;
  if v_resolution = 'replacement' and exists (
    select 1
    from (
      select x.product_id, count(distinct coalesce(x.size, '')) as sizes, max(x.size) as size
      from jsonb_to_recordset(p_items) as x(product_id text, qty integer, size text)
      where x.qty > 0
      group by x.product_id
    ) q
    left join public.order_items oi on oi.order_id = p_order_id and oi.product_id = q.product_id
    left join public.products p on p.id = q.product_id
    where q.sizes > 1
       or (q.size is not null and (p.sizes is null or not q.size = any (p.sizes)))
       or (v_sized and (q.size is null or q.size is not distinct from oi.size))
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'size';
  end if;

  select o.id, o.status, o.delivered_at, o.payment_method, o.subtotal_minor - o.discount_minor as paid_minor, o.tax_minor, o.ship_minor,
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
  -- nothing in the order (a replacement included) is inside its window any more
  if not exists (select 1 from private.return_windows(p_order_id) w where w.return_by >= now()) then
    raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'window_closed';
  end if;
  -- a replacement refunds nothing, and a balance order already goes back to the balance
  if v_resolution = 'replacement' or v_o.payment_method in ('giftcard', 'amazonpay') then
    v_refund_to := 'original';
  end if;

  -- what's asked for, per product, against what's still returnable (refund
  -- returns only: replaced units were swapped, not given back), what's inside
  -- its window today, and what can still be replaced
  with req as (
    select x.product_id, sum(x.qty)::integer as qty
    from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
    where x.qty > 0
    group by x.product_id
  ),
  avail as (
    select oi.product_id, oi.unit_price_minor - oi.unit_discount_minor as unit_paid_minor, oi.protection_minor as unit_plan_minor,
           w.left_qty, w.open_qty, w.replace_qty
    from public.order_items oi
    join private.return_windows(p_order_id) w on w.line_no = oi.line_no
    where oi.order_id = p_order_id
  )
  select count(*)::integer,
         count(*) filter (where a.left_qty >= q.qty)::integer,
         count(*) filter (where a.open_qty >= q.qty)::integer,
         count(*) filter (where a.replace_qty >= q.qty)::integer,
         coalesce(sum(q.qty * a.unit_paid_minor), 0)::integer,
         (select coalesce(sum(a2.left_qty), 0) from avail a2)::integer - coalesce(sum(q.qty), 0)::integer,
         coalesce(sum(q.qty * a.unit_plan_minor), 0)::integer
    into v_lines, v_ok, v_open, v_fresh, v_items, v_left, v_prot
  from req q
  left join avail a on a.product_id = q.product_id;
  if v_lines = 0 or v_ok <> v_lines then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;
  -- still to return, but only a replacement inside its own window can go back now
  if v_open <> v_lines then
    raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'window_closed';
  end if;

  -- an item in a replacement-only category goes back for a fault only, as a replacement, and is
  -- refunded only when it can't be: replaced once already, off sale or out of stock
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
    join public.order_items oi on oi.order_id = p_order_id and oi.product_id = x.product_id
    where x.qty > 0 and oi.replacement_only
  ) then
    if not v_fault then
      raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'replacement_only';
    end if;
    if v_resolution = 'refund' and exists (
      select 1
      from (
        select x.product_id, sum(x.qty)::integer as qty
        from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
        where x.qty > 0
        group by x.product_id
      ) q
      join public.products p on p.id = q.product_id
      join lateral (
        select bool_or(oi.replacement_only) as only, sum(w.replace_qty)::integer as replace_qty
        from public.order_items oi
        join private.return_windows(p_order_id) w on w.line_no = oi.line_no
        where oi.order_id = p_order_id and oi.product_id = q.product_id
      ) l on true
      where l.only and l.replace_qty >= q.qty and p.archived_at is null and p.stock >= q.qty
    ) then
      raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'replacement_only';
    end if;
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
                              dropoff_code, dropoff_by, replacement_shipped_at, replacement_delivered_at, refund_to)
  values (p_order_id, v_uid, p_reason, v_comment, v_resolution, v_items,
          greatest(coalesce(v_tax, 0), 0), greatest(coalesce(v_ship, 0), 0), v_prot,
          substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), now() + interval '14 days', v_shipped, v_delivered, v_refund_to)
  returning id into v_id;

  insert into public.return_items (return_id, order_id, product_id, qty, size)
  select v_id, p_order_id, x.product_id, sum(x.qty)::integer,
         -- a replacement in the size ordered sends the same item again
         case when v_resolution = 'replacement' and max(x.size) is distinct from max(oi.size) then max(x.size) end
  from jsonb_to_recordset(p_items) as x(product_id text, qty integer, size text)
  left join public.order_items oi on oi.order_id = p_order_id and oi.product_id = x.product_id
  where x.qty > 0
  group by x.product_id;

  return private.return_json(v_id);
end
$$;

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
    'wrap_minor', r.wrap_minor,
    'refund_minor', r.refund_minor, 'balance_refund_minor', r.balance_refund_minor,
    'refund_status', r.refund_status, 'refunded_at', r.refunded_at, 'refund_to', r.refund_to,
    'dropoff_code', r.dropoff_code, 'dropoff_by', r.dropoff_by, 'reject_note', r.reject_note,
    'method', r.method, 'pickup_on', r.pickup_on,
    'dropoff_point', (
      select jsonb_build_object(
               'id', pp.id, 'kind', pp.kind, 'name', pp.name, 'line1', pp.line1, 'city', pp.city,
               'state', pp.state, 'postcode', pp.postcode, 'hours', pp.hours, 'hold_days', pp.hold_days
             )
      from public.pickup_points pp
      where pp.id = r.dropoff_point_id
    ),
    'created_at', r.created_at, 'received_at', r.received_at, 'rejected_at', r.rejected_at, 'cancelled_at', r.cancelled_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', ri.product_id, 'qty', ri.qty,
               'title', oi.title, 'image', oi.image, 'unit_price_minor', oi.unit_price_minor, 'size', oi.size,
               'exchange_size', ri.size
             ) order by oi.line_no)
      from public.return_items ri
      join public.order_items oi on oi.order_id = ri.order_id and oi.product_id = ri.product_id
      where ri.return_id = r.id
    ), '[]'::jsonb)
  )
  from public.returns r
  where r.id = p_return_id
$$;
