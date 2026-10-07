/*
 * Refund a return to the balance, as Amazon's "Refund to gift card balance" (amazon.in's
 * "Refund to Amazon Pay balance"): when returning items for a refund, a shopper who paid any
 * other way (card, UPI, net banking, EMI, cash on delivery) can have the refund go onto their
 * balance in that store instead of back to how they paid. It's paid in as soon as the return
 * is received, with no wait on the bank or Stripe.
 *
 * - returns.refund_to: 'original' (how they paid, as before) or 'balance'.
 * - request_return() takes p_refund_to. A replacement refunds nothing and a balance order
 *   already goes back to the balance, so both stay 'original'.
 * - admin_receive_return() settles a balance refund at once (no Stripe refund for a card
 *   order), and the returns_refund_balance trigger pays it in.
 */

alter table public.returns
  add column refund_to text not null default 'original' check (refund_to in ('original', 'balance'));

-- another argument changes the signature, so the old one goes first
drop function public.request_return(text, jsonb, text, text, text);

create function public.request_return(
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
  if now() > v_o.delivered_at + make_interval(days => v_o.return_days) then
    raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'window_closed';
  end if;
  -- a replacement refunds nothing, and a balance order already goes back to the balance
  if v_resolution = 'replacement' or v_o.payment_method in ('giftcard', 'amazonpay') then
    v_refund_to := 'original';
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
    'refund_minor', r.refund_minor,
    'refund_status', r.refund_status, 'refunded_at', r.refunded_at, 'refund_to', r.refund_to,
    'dropoff_code', r.dropoff_code, 'dropoff_by', r.dropoff_by, 'reject_note', r.reject_note,
    'created_at', r.created_at, 'received_at', r.received_at, 'rejected_at', r.rejected_at, 'cancelled_at', r.cancelled_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', ri.product_id, 'qty', ri.qty,
               'title', oi.title, 'image', oi.image, 'unit_price_minor', oi.unit_price_minor, 'size', oi.size
             ) order by oi.line_no)
      from public.return_items ri
      join public.order_items oi on oi.order_id = ri.order_id and oi.product_id = ri.product_id
      where ri.return_id = r.id
    ), '[]'::jsonb)
  )
  from public.returns r
  where r.id = p_return_id
$$;

create or replace function public.admin_receive_return(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method text;
  v_to     text;
begin
  perform private.require_admin();
  select o.payment_method, r.refund_to into v_method, v_to
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
         -- a card refund waits on Stripe; one to the balance is paid in now (returns_refund_balance)
         refund_status = case when v_method = 'card' and v_to = 'original' and r.refund_minor > 0 then 'pending' else 'succeeded' end,
         refunded_at = case when v_method = 'card' and v_to = 'original' and r.refund_minor > 0 then null else now() end
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

create or replace function private.returns_refund_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders o where o.id = new.order_id;
  if new.refund_to = 'balance'
     or (v_order.payment_method in ('giftcard', 'amazonpay')
         and exists (select 1 from public.balance_entries e where e.order_id = v_order.id and e.kind = 'order')) then
    perform private.move_balance(v_order.user_id, v_order.market_id, new.refund_minor, 'refund', null, v_order.id, new.id);
  end if;
  return null;
end
$$;

revoke execute on function public.request_return(text, jsonb, text, text, text, text) from public, anon;
grant execute on function public.request_return(text, jsonb, text, text, text, text) to authenticated;
