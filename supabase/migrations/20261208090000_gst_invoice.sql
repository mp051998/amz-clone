/*
 * GST invoices, as amazon.in's "Use GST invoice": a business buyer in India adds their GSTIN and
 * business name to an order, at checkout or until it ships, and the invoice is made out to them
 * so they can claim input tax credit.
 *
 * - orders.gstin / orders.gst_name: both or neither.
 * - private.gstin_valid(): the 15-character format (state code, PAN, entity number, 'Z', check
 *   character) and the check character itself.
 * - set_order_gst(order, gstin, name): the owner adds, changes or (blank GSTIN) removes them on
 *   an India order while it's unpaid or being prepared.
 */

alter table public.orders
  add column gstin    text,
  add column gst_name text,
  add constraint orders_gst_check check ((gstin is null) = (gst_name is null));

create function private.gstin_valid(p_gstin text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  c     constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_sum integer := 0;
  v_p   integer;
begin
  if p_gstin is null or p_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    return false;
  end if;
  -- states and union territories 01–38, and 97 for other territory
  if substr(p_gstin, 1, 2)::integer not between 1 and 38 and substr(p_gstin, 1, 2) <> '97' then
    return false;
  end if;
  -- base-36 values, every second one doubled, each product's quotient and remainder by 36 summed
  for i in 1..14 loop
    v_p := (strpos(c, substr(p_gstin, i, 1)) - 1) * (case when i % 2 = 1 then 1 else 2 end);
    v_sum := v_sum + v_p / 36 + v_p % 36;
  end loop;
  return substr(c, (36 - v_sum % 36) % 36 + 1, 1) = substr(p_gstin, 15, 1);
end
$$;

revoke execute on function private.gstin_valid(text) from public, anon, authenticated;

/** 404 order_not_found; 409 gst_unavailable outside India, gst_locked once shipped or cancelled; 22023 invalid_input (gstin | gst_name). */
create function public.set_order_gst(p_order_id text, p_gstin text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_gstin text := nullif(upper(regexp_replace(coalesce(p_gstin, ''), '\s', '', 'g')), '');
  v_name  text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_gstin is not null and not private.gstin_valid(v_gstin) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'gstin';
  end if;
  if v_gstin is not null and (v_name is null or char_length(v_name) > 100) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'gst_name';
  end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.user_id = auth.uid() for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.market_id <> 'IN' then
    raise exception 'gst_unavailable' using errcode = 'P0001';
  end if;
  if private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at)
     not in ('awaiting_payment', 'preparing') then
    raise exception 'gst_locked' using errcode = 'P0001';
  end if;

  update public.orders o
     set gstin = v_gstin,
         gst_name = case when v_gstin is null then null else v_name end
   where o.id = p_order_id;
  return private.order_json(p_order_id);
end
$$;

revoke execute on function public.set_order_gst(text, text, text) from public, anon;
grant execute on function public.set_order_gst(text, text, text) to authenticated, service_role;
