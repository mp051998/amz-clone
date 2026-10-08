-- Drop-off spot: where the courier leaves a package at an address when nobody's there to take it,
-- as on Amazon's address book ("Where should we leave your packages at this address?"): the front
-- door, back door, side porch, garage, mailroom, building reception or property staff. Null is no
-- preference. It's saved with the address and copied onto the order like the delivery instructions,
-- so the order keeps the spot it was placed with; the shopper can change it on the order until it's
-- out for delivery. A delivered order says where it was left.

alter table public.addresses
  add column dropoff text
  check (dropoff in ('front_door', 'back_door', 'side_porch', 'garage', 'mailroom', 'reception', 'property_staff'));

alter table public.orders
  add column ship_dropoff text
  check (ship_dropoff in ('front_door', 'back_door', 'side_porch', 'garage', 'mailroom', 'reception', 'property_staff'));

-- ---------------------------------------------------------------------------
-- The order's drop-off spot (owner): set just after it's placed (checkout sends the one it showed),
-- and changeable, as the instructions are, until it's out for delivery. Null clears it. A pickup
-- order has none.
-- ---------------------------------------------------------------------------
create function public.set_my_order_dropoff(p_order_id text, p_dropoff text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_spot  text := nullif(btrim(coalesce(p_dropoff, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if v_spot is not null and v_spot not in ('front_door', 'back_door', 'side_porch', 'garage', 'mailroom', 'reception', 'property_staff') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'dropoff';
  end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.user_id = auth.uid() for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.pickup_point_id is not null
     or private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at)
        not in ('awaiting_payment', 'preparing', 'shipped') then
    raise exception 'order_not_editable' using errcode = 'P0001';
  end if;
  update public.orders o set ship_dropoff = v_spot where o.id = p_order_id;
  return private.order_json(p_order_id);
end $$;

revoke execute on function public.set_my_order_dropoff(text, text) from public, anon;
grant execute on function public.set_my_order_dropoff(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_my_order_address (as in 20261212090000_pickup_points) takes the address's drop-off spot too,
-- as it does its instructions: both belong to the place.
-- ---------------------------------------------------------------------------
create or replace function public.set_my_order_address(p_order_id text, p_address_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_addr  public.addresses;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.user_id = auth.uid() for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at) <> 'preparing' then
    raise exception 'order_address_locked' using errcode = 'P0001';
  end if;
  select * into v_addr from public.addresses a
   where a.id = p_address_id and a.user_id = auth.uid() and a.market_id = v_order.market_id;
  if not found then raise exception 'address_not_found' using errcode = 'P0002'; end if;

  update public.orders o
     set ship_name = v_addr.full_name,
         ship_phone = v_addr.phone,
         ship_line1 = v_addr.line1,
         ship_line2 = v_addr.line2,
         ship_landmark = v_addr.landmark,
         ship_city = v_addr.city,
         ship_state = v_addr.state,
         ship_postcode = v_addr.postcode,
         ship_instructions = v_addr.instructions,
         ship_dropoff = v_addr.dropoff,
         pickup_point_id = null,
         pickup_code = null
   where o.id = p_order_id;
  return private.order_json(p_order_id);
end $$;
