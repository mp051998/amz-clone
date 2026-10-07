-- Change where an order goes after it's placed, as on Amazon: to another address in the shopper's
-- address book for the same store, while the order is being prepared (not once it has shipped).
-- The order takes that address's delivery instructions too, since they belong to the place (a gate
-- code, a front desk); the shopper can still change them on the order until it's out for delivery.
-- Totals don't change: shipping and tax are per store and speed, not per address.

create function public.set_my_order_address(p_order_id text, p_address_id uuid)
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
         ship_instructions = v_addr.instructions
   where o.id = p_order_id;
  return private.order_json(p_order_id);
end $$;

revoke execute on function public.set_my_order_address(text, uuid) from public, anon;
grant execute on function public.set_my_order_address(text, uuid) to authenticated, service_role;
