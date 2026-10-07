-- "Package didn't arrive" with a replacement, as on Amazon: when an order marked delivered never
-- turned up, the shopper chooses between their money back (as before) and the same items sent
-- again at no charge.
--
-- A replacement claim is a not_received return with resolution 'replacement' covering every item
-- left in the order. The new units come out of stock now and ship on the usual schedule (10 hours,
-- then standard delivery), nothing is refunded, and there's nothing to send back, so it's received
-- the moment it's made. Every item has to be on sale and in stock, or the claim is refused with
-- replacement_unavailable (out_of_stock) and the shopper can take the refund instead. As with any
-- replacement, the units count as replaced (they can't be replaced again) and stay returnable for
-- a refund while the return window is open, since the shopper now has them.

drop function public.report_not_received(text);

/**
 * Report the caller's delivered order as never arrived. p_resolution 'refund' (the default) gives
 * back everything paid for it; 'replacement' sends every item again at no charge. Raises
 * return_not_allowed (detail not_delivered | cash_on_delivery | window_closed | returned),
 * invalid_input (resolution) and replacement_unavailable (out_of_stock).
 */
create function public.report_not_received(p_order_id text, p_resolution text default 'refund')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_resolution text := coalesce(nullif(btrim(p_resolution), ''), 'refund');
  v_o          public.orders;
  v_tz         text;
  v_line       record;
  v_shipped    timestamptz;
  v_delivered  timestamptz;
  v_code       text := upper(md5(gen_random_uuid()::text));
  v_id         uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_resolution not in ('refund', 'replacement') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'resolution';
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

  if v_resolution = 'replacement' then
    -- the new units come out of stock now, product by product in a stable order
    for v_line in
      select oi.product_id, sum(oi.qty)::integer as qty
      from public.order_items oi
      where oi.order_id = p_order_id
      group by oi.product_id
      order by oi.product_id
    loop
      update public.products p set stock = p.stock - v_line.qty
       where p.id = v_line.product_id and p.archived_at is null and p.stock >= v_line.qty;
      if not found then
        raise exception 'replacement_unavailable' using errcode = 'P0001', detail = 'out_of_stock';
      end if;
    end loop;

    select m.time_zone into v_tz from public.markets m where m.id = v_o.market_id;
    v_shipped := now() + interval '10 hours';
    select d.delivered into v_delivered from private.delivery_after(v_shipped, coalesce(v_tz, 'UTC')) d;

    -- nothing to send back and nothing to refund: received now
    insert into public.returns (order_id, user_id, reason, resolution, items_minor, tax_minor, ship_minor, protection_minor, wrap_minor,
                                dropoff_code, dropoff_by, replacement_shipped_at, replacement_delivered_at,
                                status, received_at, refund_status, refunded_at)
    values (p_order_id, v_uid, 'not_received', 'replacement', 0, 0, 0, 0, 0,
            substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), now(), v_shipped, v_delivered,
            'received', now(), 'succeeded', now())
    returning id into v_id;

    insert into public.return_items (return_id, order_id, product_id, qty)
    select v_id, p_order_id, oi.product_id, oi.qty
    from public.order_items oi
    where oi.order_id = p_order_id;

    return private.return_json(v_id);
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

revoke execute on function public.report_not_received(text, text) from public, anon;
grant execute on function public.report_not_received(text, text) to authenticated, service_role;
