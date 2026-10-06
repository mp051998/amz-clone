/**
 * confirm_order_payment put any cancelled card order back to `placed`. That is meant for an unpaid
 * checkout that a newer one abandoned and whose payment lands later. But it also caught an order
 * that was paid, then cancelled and refunded: reopening /checkout/success?session_id=… or a
 * repeated checkout.session.completed re-reads the session (still `paid` after a refund), and the
 * order was placed again with its stock taken and its refund already sent. The same went for an
 * order marked sold out (mark_sold_out) once its stock came back.
 *
 * Only an order that was never placed and is owed no refund can be revived now; for the others a
 * repeat confirmation returns the order as it is.
 */

create or replace function public.confirm_order_payment(
  p_order_id      text,
  p_session_id    text,
  p_amount_minor  integer,
  p_currency      text,
  p_payment_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line  record;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status = 'placed' then
    return private.order_json(p_order_id);
  end if;
  -- paid once and cancelled since (the shopper or an admin cancelled it, or it sold out before the
  -- payment landed): its refund is owed or done, so confirming the same payment again (the success
  -- page reopened, a webhook retried) leaves it cancelled
  if v_order.status = 'cancelled' and (v_order.placed_at is not null or v_order.refund_status is not null) then
    return private.order_json(p_order_id);
  end if;
  if v_order.payment_method <> 'card' then
    raise exception 'not_a_card_order' using errcode = 'P0001';
  end if;
  if v_order.stripe_session_id is not null and v_order.stripe_session_id <> p_session_id then
    raise exception 'session_mismatch' using errcode = 'P0001';
  end if;
  if p_amount_minor is distinct from v_order.total_minor or upper(p_currency) is distinct from v_order.currency then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  if v_order.status = 'cancelled' then
    for v_line in
      select oi.product_id, oi.qty, p.stock
      from public.order_items oi join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
      order by oi.product_id
      for update of p
    loop
      if v_line.stock < v_line.qty then
        raise exception 'stock_released' using errcode = 'P0001', detail = v_line.product_id;
      end if;
    end loop;
    update public.products p
       set stock = p.stock - oi.qty
      from public.order_items oi
     where oi.order_id = p_order_id and p.id = oi.product_id;
  end if;

  update public.orders o
     set status = 'placed',
         placed_at = now(),
         cancelled_at = null,
         stripe_session_id = p_session_id,
         payment_label = coalesce(nullif(btrim(p_payment_label), ''), o.payment_label)
   where o.id = p_order_id;

  -- take the purchased quantities out of the buyer's cart (other lines stay); Buy Now never used it
  if v_order.from_cart then
    delete from public.cart_items ci
     using public.carts c, public.order_items oi
     where c.id = ci.cart_id and c.user_id = v_order.user_id and c.market_id = v_order.market_id
       and oi.order_id = p_order_id and oi.product_id = ci.product_id and ci.qty <= oi.qty;
    update public.cart_items ci
       set qty = ci.qty - oi.qty
      from public.carts c, public.order_items oi
     where c.id = ci.cart_id and c.user_id = v_order.user_id and c.market_id = v_order.market_id
       and oi.order_id = p_order_id and oi.product_id = ci.product_id and ci.qty > oi.qty;
  end if;

  return private.order_json(p_order_id);
end
$$;
