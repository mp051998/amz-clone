-- Return methods, as Amazon's "How would you like to return it?": a return goes back either
-- dropped off (at any drop-off point, or at the Hub Locker or Hub Counter the shopper picks) or
-- picked up by a courier from the delivery address on a day the shopper picks, from tomorrow
-- until the drop-off deadline. Either way it carries the return's code. The shopper chooses
-- when starting the return and can change it until the items reach the store. An order
-- collected from a pickup point has no address to collect from, so it can only be dropped off.
-- ---------------------------------------------------------------------------

alter table public.returns
  add column method text not null default 'dropoff' check (method in ('dropoff', 'pickup')),
  add column dropoff_point_id text references public.pickup_points (id),
  add column pickup_on date,
  add constraint returns_method_fields_check check (
    (method = 'pickup') = (pickup_on is not null) and (method = 'dropoff' or dropoff_point_id is null)
  );

-- ---------------------------------------------------------------------------
-- private.return_json (as in 20261205090000_return_refund_to_balance) with the method, the
-- drop-off point chosen and the pickup day.
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

-- ---------------------------------------------------------------------------
-- choose_return_method: how the caller's open return goes back. 'dropoff' at p_point (one of the
-- store's working pickup points) or anywhere (null); 'pickup' on p_pickup_on, from the store's
-- tomorrow through the drop-off deadline. return_not_open once it's been received, rejected or
-- cancelled (and for a missing package, which has nothing to send).
-- ---------------------------------------------------------------------------
create or replace function public.choose_return_method(
  p_return_id uuid,
  p_method    text,
  p_point     text default null,
  p_pickup_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r     record;
  v_tz    text;
  v_point text := nullif(btrim(coalesce(p_point, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select r.status, r.reason, r.dropoff_by, o.market_id, o.pickup_point_id, m.time_zone into v_r
  from public.returns r
  join public.orders o on o.id = r.order_id
  join public.markets m on m.id = o.market_id
  where r.id = p_return_id and r.user_id = auth.uid()
  for update of r;
  if not found then
    raise exception 'return_not_found' using errcode = 'P0002';
  end if;
  if v_r.status <> 'requested' or v_r.reason = 'not_received' then
    raise exception 'return_not_open' using errcode = 'P0001';
  end if;
  if p_method is null or p_method not in ('dropoff', 'pickup') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'method';
  end if;

  if p_method = 'dropoff' then
    if v_point is not null and not exists (
      select 1 from public.pickup_points pp where pp.id = v_point and pp.market_id = v_r.market_id and pp.active
    ) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'pickup_point';
    end if;
    update public.returns r set method = 'dropoff', dropoff_point_id = v_point, pickup_on = null where r.id = p_return_id;
  else
    -- a courier collects from the delivery address, which an order collected from a pickup point doesn't have
    if v_r.pickup_point_id is not null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'method';
    end if;
    v_tz := coalesce(v_r.time_zone, 'UTC');
    if p_pickup_on is null
       or p_pickup_on <= (now() at time zone v_tz)::date
       or p_pickup_on > (v_r.dropoff_by at time zone v_tz)::date then
      raise exception 'invalid_input' using errcode = '22023', detail = 'pickup_on';
    end if;
    update public.returns r set method = 'pickup', dropoff_point_id = null, pickup_on = p_pickup_on where r.id = p_return_id;
  end if;
  return private.return_json(p_return_id);
end
$$;

revoke execute on function public.choose_return_method(uuid, text, text, date) from public, anon;
grant execute on function public.choose_return_method(uuid, text, text, date) to authenticated;
