-- Request cancellation: once an order ships it can't be cancelled outright, but until it's out for
-- delivery the shopper can ask for it to be stopped. The carrier sends the package back to us, so
-- the order is cancelled as one before shipping is (stock back, refunded the way it was paid), with
-- the reason 'intercepted'. Out for delivery it's too late: the shopper returns it once it arrives.
-- A No-Rush order earned its reward by shipping (the order page already says it's added), so
-- that's paid first: cancelled orders are never credited.

alter table public.orders drop constraint orders_cancel_reason_check;
alter table public.orders
  add constraint orders_cancel_reason_check check (cancel_reason in ('customer', 'admin', 'sold_out', 'intercepted'));

/**
 * Shopper asks to stop a shipped order on its way. Not shipped yet (or unpaid) it's simply
 * cancelled, as cancel_my_order does; out for delivery or delivered, 409 order_not_cancellable
 * (detail: the stage). Asking again once it's cancelled is a no-op.
 */
create function public.request_order_cancellation(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o     record;
  v_stage text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select o.status, o.market_id, o.shipped_at, o.out_for_delivery_at, o.delivered_at into v_o
    from public.orders o
   where o.id = p_order_id and o.user_id = auth.uid()
   for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  v_stage := private.order_stage(v_o.status, v_o.shipped_at, v_o.out_for_delivery_at, v_o.delivered_at);
  if v_stage in ('awaiting_payment', 'preparing', 'cancelled') then
    return public.cancel_my_order(p_order_id);
  end if;
  if v_stage <> 'shipped' then
    raise exception 'order_not_cancellable' using errcode = 'P0001', detail = v_stage;
  end if;
  perform private.credit_no_rush_rewards(auth.uid(), v_o.market_id);
  perform private.cancel_placed_order(p_order_id, 'intercepted');
  return private.order_json(p_order_id);
end
$$;

revoke execute on function public.request_order_cancellation(text) from public, anon;
grant execute on function public.request_order_cancellation(text) to authenticated;
