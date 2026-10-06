-- Change an order's delivery instructions after it's placed, as on Amazon: while it's being
-- prepared or on its way to the local depot, until it's out for delivery. Blank clears them.
-- The address book's saved note doesn't change.

create function public.set_my_order_instructions(p_order_id text, p_instructions text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_instr text := nullif(btrim(replace(replace(coalesce(p_instructions, ''), E'\r\n', E'\n'), E'\r', E'\n')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if char_length(v_instr) > 250 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'instructions';
  end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.user_id = auth.uid() for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at)
     not in ('preparing', 'shipped') then
    raise exception 'order_not_editable' using errcode = 'P0001';
  end if;
  update public.orders o set ship_instructions = v_instr where o.id = p_order_id;
  return private.order_json(p_order_id);
end $$;

revoke execute on function public.set_my_order_instructions(text, text) from public, anon;
grant execute on function public.set_my_order_instructions(text, text) to authenticated, service_role;
