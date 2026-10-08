-- Items missing from a package, as Amazon's "Problem with order" > "Item missing from package":
-- the order arrived, but some of what was in it didn't. The shopper picks which items (and how
-- many) were missing and gets a refund for them, or the same items sent again, with nothing to
-- send back.
--
-- - returns.reason gains missing_item ("Item missing from the package"). It's the store's fault,
--   so a refund also gives back the items' share of the delivery charge, and a replacement can be
--   asked for.
-- - request_return() (as in 20270120090000_size_exchange.sql) takes missing_item. Everything about
--   a return holds (the return windows, what's left to return, replacement-only items, refunds to
--   the balance), except that the return is received as soon as it's made: refunded at once (a
--   card refund goes to Stripe from the app, as for a received return) or the replacement sent.
--   Nothing is restocked: nothing came back.
-- - product_return_signal() (as in 20270121090000_fit_signal.sql) leaves missing items out, like a
--   package that didn't arrive: they say nothing about the product.

alter table public.returns drop constraint returns_reason_check;
alter table public.returns add constraint returns_reason_check check (reason in (
  'no_longer_needed', 'bought_by_mistake', 'better_price', 'too_small', 'too_large',
  'damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described', 'not_received', 'atoz_claim', 'missing_item'));

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
  v_fault      boolean := p_reason in ('damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described', 'missing_item');
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
      'damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described', 'missing_item') then
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

  -- nothing comes back from a package it was missing from: received now, and refunded unless a
  -- card refund has to go to Stripe (as admin_receive_return, without the restock)
  if p_reason = 'missing_item' then
    update public.returns r
       set dropoff_by = now(),
           status = 'received',
           received_at = now(),
           refund_status = case when v_o.payment_method = 'card' and r.refund_to = 'original' and r.refund_minor > 0 then 'pending' else 'succeeded' end,
           refunded_at = case when v_o.payment_method = 'card' and r.refund_to = 'original' and r.refund_minor > 0 then null else now() end
     where r.id = v_id;
  end if;

  return private.return_json(v_id);
end
$$;

create or replace function public.product_return_signal(p_product text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with sold as (
    select oi.order_id, oi.qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id = p_product
      and o.status = 'placed'
      and o.delivered_at <= now()
      and o.delivered_at > now() - interval '90 days'
  ),
  back as (
    select r.id, r.reason, ri.qty
    from public.return_items ri
    join public.returns r on r.id = ri.return_id
    where ri.product_id = p_product
      and ri.order_id in (select s.order_id from sold s)
      and r.status not in ('cancelled', 'rejected')
      and r.reason not in ('not_received', 'atoz_claim', 'missing_item')
  ),
  totals as (
    select
      (select coalesce(sum(s.qty), 0) from sold s) as sold,
      (select coalesce(sum(b.qty), 0) from back b) as returned,
      (select count(distinct b.id) from back b) as returns,
      (select coalesce(sum(b.qty), 0) from back b where b.reason = 'too_small') as small,
      (select coalesce(sum(b.qty), 0) from back b where b.reason = 'too_large') as large
  ),
  verdict as (
    select
      t.sold >= 10 and t.returns >= 2 and t.returned * 10 >= t.sold as frequent,
      t.sold >= 20 and t.returned * 50 <= t.sold as kept,
      case
        when (t.small + t.large) * 20 < t.sold then null
        when t.small >= 3 and t.small >= 2 * t.large then 'small'
        when t.large >= 3 and t.large >= 2 * t.small then 'large'
      end as fit
    from totals t
  )
  select jsonb_build_object(
    'frequent', v.frequent,
    'kept', v.kept,
    'reason', case when v.frequent then (
      select b.reason
      from back b
      where b.reason in ('damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described')
      group by b.reason
      order by sum(b.qty) desc, b.reason
      limit 1
    ) end,
    'fit', v.fit
  )
  from verdict v
$$;
