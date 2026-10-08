-- Pay now by card: a Pay on Delivery order (amazon.in) can be paid by credit or debit card too,
-- on Stripe's hosted page, as well as by UPI, net banking or the balance. The server opens the
-- session (attach_pay_now_session) and, once Stripe says it's paid, switches the order to a card
-- order (confirm_pay_now_payment), which refunds like one from then on.

alter table public.orders drop constraint orders_prepaid_method;
alter table public.orders add constraint orders_prepaid_method
  check (prepaid_at is null or payment_method in ('card', 'upi', 'netbanking', 'amazonpay'));

-- ---------------------------------------------------------------------------
-- attach_pay_now_session (server only): the Stripe session opened to pay an open Pay on Delivery
-- order by card, kept on the order so it can be reopened rather than a second one opened, and
-- closed when the order is cancelled. `order_not_payable` when the order can't be paid now.
-- ---------------------------------------------------------------------------
create function public.attach_pay_now_session(p_order_id text, p_session_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.payment_method <> 'cod' or v_order.status <> 'placed'
     or private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at) = 'delivered' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  update public.orders o set stripe_session_id = p_session_id where o.id = p_order_id;
end $$;

-- ---------------------------------------------------------------------------
-- confirm_pay_now_payment (server only): Stripe says a Pay now session is paid. The order becomes a
-- card order paid now (`prepaid_at`), with the session and PaymentIntent refunds go by. Idempotent:
-- the same session again returns the order as it is. `order_not_payable` (detail `cancelled`,
-- `delivered` or `not_cod`, which is also a second session paid after the first) or
-- `amount_mismatch` (the total changed since, items cancelled meanwhile) leave it unpaid, and the
-- caller refunds the payment.
-- ---------------------------------------------------------------------------
create function public.confirm_pay_now_payment(
  p_order_id       text,
  p_session_id     text,
  p_amount_minor   integer,
  p_currency       text,
  p_payment_label  text,
  p_payment_intent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.payment_method = 'card' and v_order.prepaid_at is not null and v_order.stripe_session_id = p_session_id then
    return private.order_json(p_order_id);
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'order_not_payable' using errcode = 'P0001', detail = 'cancelled';
  end if;
  if v_order.payment_method <> 'cod' or v_order.status <> 'placed' then
    raise exception 'order_not_payable' using errcode = 'P0001', detail = 'not_cod';
  end if;
  if private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at) = 'delivered' then
    raise exception 'order_not_payable' using errcode = 'P0001', detail = 'delivered';
  end if;
  if p_amount_minor is distinct from v_order.total_minor or upper(p_currency) is distinct from v_order.currency then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  update public.orders o
     set payment_method = 'card',
         payment_label = coalesce(nullif(btrim(coalesce(p_payment_label, '')), ''), 'Card'),
         stripe_session_id = p_session_id,
         stripe_payment_intent = coalesce(p_payment_intent, o.stripe_payment_intent),
         prepaid_at = now()
   where o.id = p_order_id;
  return private.order_json(p_order_id);
end $$;

revoke execute on function public.attach_pay_now_session(text, text) from public, anon, authenticated;
revoke execute on function public.confirm_pay_now_payment(text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.attach_pay_now_session(text, text) to service_role;
grant execute on function public.confirm_pay_now_payment(text, text, integer, text, text, text) to service_role;
