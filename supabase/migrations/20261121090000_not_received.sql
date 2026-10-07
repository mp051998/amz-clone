-- "Package didn't arrive", as on Amazon's Problem with order: when an order is marked delivered
-- but never turned up, the shopper reports it from the order page, from the moment it's marked
-- delivered until 30 days after, and gets everything they paid for it back straight away: items,
-- tax, delivery, gift wrap and protection plans. Nothing is sent back, so no stock returns.
--
-- The claim is a return with reason 'not_received' covering every item left in the order,
-- received and refunded the moment it's made (card refunds then go to Stripe as for any return;
-- balance orders are refunded to the balance by the returns_refund_balance trigger). It's only
-- for an order nothing has been returned from: once any of it came back, it evidently arrived.
-- Cash on delivery orders can't be reported: their money is only taken when the package is.
-- Claims don't count towards a product's "frequently returned" signal.

alter table public.returns drop constraint returns_reason_check;
alter table public.returns add constraint returns_reason_check check (reason in (
  'no_longer_needed', 'bought_by_mistake', 'better_price',
  'damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described', 'not_received'));

alter table public.returns
  add column wrap_minor integer not null default 0 check (wrap_minor >= 0);
alter table public.returns
  alter column refund_minor set expression as (items_minor + tax_minor + ship_minor + protection_minor + wrap_minor);

-- ---------------------------------------------------------------------------
-- JSON (as in 20261119090000_return_protection): the gift wrap refunded
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
    'wrap_minor', r.wrap_minor,
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
-- report_not_received: the caller's delivered order never arrived
-- ---------------------------------------------------------------------------
create function public.report_not_received(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_o    public.orders;
  v_code text := upper(md5(gen_random_uuid()::text));
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_o
  from public.orders o
  where o.id = p_order_id and o.user_id = v_uid
  for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_o.status <> 'placed' or v_o.delivered_at is null or v_o.delivered_at > now() then
    raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'not_delivered';
  end if;
  if v_o.payment_method = 'cod' then
    raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'cash_on_delivery';
  end if;
  if now() > v_o.delivered_at + interval '30 days' then
    raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'window_closed';
  end if;
  if exists (select 1 from public.returns r where r.order_id = p_order_id and r.status <> 'cancelled') then
    raise exception 'return_not_allowed' using errcode = 'P0001', detail = 'returned';
  end if;

  -- what's left of the order after any cancelled items, all of it
  insert into public.returns (order_id, user_id, reason, resolution, items_minor, tax_minor, ship_minor, protection_minor, wrap_minor,
                              dropoff_code, dropoff_by)
  values (p_order_id, v_uid, 'not_received', 'refund', v_o.subtotal_minor - v_o.discount_minor, v_o.tax_minor, v_o.ship_minor,
          v_o.protection_minor, v_o.wrap_minor, substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), now())
  returning id into v_id;

  insert into public.return_items (return_id, order_id, product_id, qty)
  select v_id, p_order_id, oi.product_id, oi.qty
  from public.order_items oi
  where oi.order_id = p_order_id;

  -- nothing to wait for: received now, and refunded unless a card refund has to go to Stripe
  update public.returns r
     set status = 'received',
         received_at = now(),
         refund_status = case when v_o.payment_method = 'card' and r.refund_minor > 0 then 'pending' else 'succeeded' end,
         refunded_at = case when v_o.payment_method = 'card' and r.refund_minor > 0 then null else now() end
   where r.id = v_id;

  return private.return_json(v_id);
end
$$;

revoke execute on function public.report_not_received(text) from public, anon;
grant execute on function public.report_not_received(text) to authenticated;

-- ---------------------------------------------------------------------------
-- product_return_signal (as in 20261108090000_frequently_returned): a package that didn't
-- arrive says nothing about the product
-- ---------------------------------------------------------------------------
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
      and r.reason <> 'not_received'
  ),
  totals as (
    select
      (select coalesce(sum(s.qty), 0) from sold s) as sold,
      (select coalesce(sum(b.qty), 0) from back b) as returned,
      (select count(distinct b.id) from back b) as returns
  ),
  verdict as (
    select t.sold >= 10 and t.returns >= 2 and t.returned * 10 >= t.sold as frequent from totals t
  )
  select jsonb_build_object(
    'frequent', v.frequent,
    'reason', case when v.frequent then (
      select b.reason
      from back b
      where b.reason in ('damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described')
      group by b.reason
      order by sum(b.qty) desc, b.reason
      limit 1
    ) end
  )
  from verdict v
$$;
