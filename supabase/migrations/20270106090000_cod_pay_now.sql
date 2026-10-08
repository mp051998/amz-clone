-- Pay now on Pay on Delivery orders (amazon.in): until it's delivered, a Cash on Delivery order
-- can be paid online instead (UPI, net banking or the Amazon Pay balance), for a contactless
-- delivery. The order becomes an order paid that way: cancelling it or some of its items, and
-- returns, refund it like one, and prepaid_at says when it was paid.

alter table public.orders add column prepaid_at timestamptz;
alter table public.orders add constraint orders_prepaid_method
  check (prepaid_at is null or payment_method in ('upi', 'netbanking', 'amazonpay'));

-- ---------------------------------------------------------------------------
-- pay_my_cod_order: the caller pays their Cash on Delivery order now, by `p_method` (`upi`,
-- `netbanking` with `p_bank`, or `amazonpay`, from the balance). `order_not_payable` (detail
-- `not_cod`, `cancelled` or `delivered`) when it can't be, `insufficient_balance` when the
-- balance doesn't cover it.
-- ---------------------------------------------------------------------------
create function public.pay_my_cod_order(p_order_id text, p_method text, p_bank text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_bank  text := nullif(btrim(coalesce(p_bank, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if coalesce(p_method, '') not in ('upi', 'netbanking', 'amazonpay') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'method';
  end if;
  if length(v_bank) > 40 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'bank';
  end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.user_id = auth.uid() for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.status = 'cancelled' then
    raise exception 'order_not_payable' using errcode = 'P0001', detail = 'cancelled';
  end if;
  if v_order.payment_method <> 'cod' or v_order.status <> 'placed' then
    raise exception 'order_not_payable' using errcode = 'P0001', detail = 'not_cod';
  end if;
  if private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at) = 'delivered' then
    raise exception 'order_not_payable' using errcode = 'P0001', detail = 'delivered';
  end if;

  if p_method = 'amazonpay' and v_order.total_minor > 0 then
    -- shipped No-Rush rewards are the shopper's to spend on it, as at checkout
    perform private.credit_no_rush_rewards(auth.uid(), v_order.market_id);
    -- the 'order' entry is what refunds of a balance-paid order go back by
    perform private.move_balance(auth.uid(), v_order.market_id, -v_order.total_minor, 'order', null, v_order.id);
  end if;

  update public.orders o
     set payment_method = p_method,
         payment_label = case p_method
           when 'upi' then 'UPI'
           when 'netbanking' then 'Net banking' || coalesce(' · ' || v_bank, '')
           when 'amazonpay' then 'Amazon Pay balance'
         end,
         bank = case when p_method = 'netbanking' then v_bank end,
         prepaid_at = now()
   where o.id = p_order_id;
  return private.order_json(p_order_id);
end $$;

revoke execute on function public.pay_my_cod_order(text, text, text) from public, anon;
grant execute on function public.pay_my_cod_order(text, text, text) to authenticated, service_role;
