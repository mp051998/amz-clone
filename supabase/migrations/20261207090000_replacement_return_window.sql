/*
 * A replacement gets its own return window, as on Amazon: the new unit can be returned for a
 * refund for the store's return days from when it was delivered, not from when the order was.
 * Until now every return was checked against the order's delivery date, so a replacement that
 * arrived near the end of the window (or after it) could barely be returned, if at all.
 *
 * - private.return_windows(order): per order line, what's left to return, the last moment it
 *   can be returned (the order's window, or the latest delivered replacement's), and how many can
 *   be returned or replaced now. Once the order's own window has closed only replacement units
 *   still inside theirs can go back, for a refund, less any refunds already started on them.
 * - order_returns(): `returnable` and `replaceable` are now what can go back today;
 *   `return_by_item` gives each product's last day, and `return_by` the latest open window (or,
 *   with nothing open, when the last one closed).
 * - request_return(): checks each requested product against its own window.
 */

create function private.return_windows(p_order_id text)
returns table (line_no integer, product_id text, left_qty integer, return_by timestamptz, closed_by timestamptz,
               open_qty integer, replace_qty integer)
language sql
stable
security definer
set search_path = ''
as $$
  with o as (
    select ord.id, ord.delivered_at, make_interval(days => m.return_days) as span
    from public.orders ord
    join public.markets m on m.id = ord.market_id
    where ord.id = p_order_id and ord.status = 'placed' and ord.delivered_at <= now()
  ),
  rep as (
    -- replacement units delivered so far, how many are still inside their own window, and when the last closed one shut
    select ri.product_id,
           max(r.replacement_delivered_at) as last_at,
           coalesce(sum(ri.qty) filter (where now() <= r.replacement_delivered_at + o.span), 0)::integer as open_qty,
           max(r.replacement_delivered_at + o.span) filter (where r.replacement_delivered_at + o.span < now()) as closed_at
    from o
    join public.returns r on r.order_id = o.id
    join public.return_items ri on ri.return_id = r.id
    where r.resolution = 'replacement' and r.status in ('requested', 'received') and r.replacement_delivered_at <= now()
    group by ri.product_id
  ),
  late as (
    -- refunds started after the order's own window closed can only have been replacement units
    select ri.product_id, sum(ri.qty)::integer as qty
    from o
    join public.returns r on r.order_id = o.id
    join public.return_items ri on ri.return_id = r.id
    where r.resolution = 'refund' and r.status in ('requested', 'received') and r.created_at > o.delivered_at + o.span
    group by ri.product_id
  )
  select x.line_no, x.product_id, x.left_qty,
         greatest(o.delivered_at, rep.last_at) + o.span,
         greatest(o.delivered_at + o.span, rep.closed_at),
         (case
            when now() <= o.delivered_at + o.span then x.left_qty
            else greatest(least(x.left_qty, coalesce(rep.open_qty, 0) - coalesce(late.qty, 0)), 0)
          end)::integer,
         -- a replacement is swapped once, inside the order's own window; after it, replacements are refund-only
         (case when now() <= o.delivered_at + o.span then x.unreplaced_qty else 0 end)::integer
  from o
  cross join private.return_counts(o.id) x
  left join rep on rep.product_id = x.product_id
  left join late on late.product_id = x.product_id
$$;

revoke execute on function private.return_windows(text) from public, anon, authenticated;

create or replace function public.order_returns(p_order_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select * from private.return_windows(p_order_id)
  )
  select jsonb_build_object(
    'delivered', o.status = 'placed' and o.delivered_at is not null and o.delivered_at <= now(),
    -- the latest open window; with none open, when the last one closed on what's left, or the
    -- latest of all once everything's been returned
    'return_by', coalesce(
      (select max(w.return_by) from w where w.open_qty > 0),
      (select max(w.closed_by) from w where w.left_qty > 0),
      (select max(w.return_by) from w)
    ),
    'return_by_item', coalesce((
      select jsonb_agg(jsonb_build_object('product_id', w.product_id, 'return_by', w.return_by) order by w.line_no)
      from w
    ), '[]'::jsonb),
    'returnable', coalesce((
      select jsonb_agg(jsonb_build_object('product_id', w.product_id, 'qty', w.open_qty) order by w.line_no)
      from w
    ), '[]'::jsonb),
    'replaceable', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', w.product_id,
               'qty', case when p.id is not null and p.archived_at is null then greatest(least(w.open_qty, w.replace_qty, p.stock), 0) else 0 end
             ) order by w.line_no)
      from w
      left join public.products p on p.id = w.product_id
    ), '[]'::jsonb),
    'returns', coalesce((
      select jsonb_agg(private.return_json(r.id) order by r.created_at desc)
      from public.returns r
      where r.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id and o.user_id = (select auth.uid())
$$;

-- same signature: only the window check changes, from the order's to each product's
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
  if v_refund_to not in ('original', 'balance') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'refund_to';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
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

  insert into public.return_items (return_id, order_id, product_id, qty)
  select v_id, p_order_id, x.product_id, sum(x.qty)::integer
  from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
  where x.qty > 0
  group by x.product_id;

  return private.return_json(v_id);
end
$$;
