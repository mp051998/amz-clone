/*
 * Gift orders: checkout can mark an order as a gift, with an optional note
 * (up to 240 characters) for the recipient, which the store packs with it.
 * place_order gains two optional arguments, so callers that don't send them
 * place ordinary orders as before.
 */
alter table public.orders
  add column gift boolean not null default false,
  add column gift_message text,
  add constraint orders_gift_message_check
    check (gift_message is null or (gift and char_length(gift_message) between 1 and 240));

drop function public.place_order(text, text, jsonb);

/**
 * Turn the caller's cart into an order. Locks the product rows, checks and
 * reserves stock, prices every line from the catalog (never from the client),
 * and snapshots title/image/price. Card orders start 'awaiting_payment' and
 * keep the cart until Stripe confirms; every other method is placed at once.
 * A cart holding an archived product can't be checked out. A gift order keeps
 * its note (trimmed, at most 240 characters); a note without the gift flag is
 * dropped.
 */
create function public.place_order(
  p_market text,
  p_payment_method text,
  p_shipping jsonb,
  p_gift boolean default false,
  p_gift_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_ship     jsonb := coalesce(p_shipping, '{}'::jsonb);
  v_methods  text[];
  v_cart     uuid;
  v_line     record;
  v_sub      integer;
  v_t        record;
  v_order_id text;
  v_status   text;
  v_name     text := private.clean_text(v_ship, 'full_name', 80);
  v_phone    text := regexp_replace(coalesce(private.clean_text(v_ship, 'phone', 20), ''), '[^0-9+]', '', 'g');
  v_line1    text := private.clean_text(v_ship, 'line1', 120);
  v_line2    text := private.clean_text(v_ship, 'line2', 120);
  v_landmark text := private.clean_text(v_ship, 'landmark', 80);
  v_city     text := private.clean_text(v_ship, 'city', 60);
  v_state    text := private.clean_text(v_ship, 'state', 60);
  v_postcode text := private.clean_text(v_ship, 'postcode', 12);
  v_gift     boolean := coalesce(p_gift, false);
  -- only a gift carries a note; blank is none
  v_note     text := case when coalesce(p_gift, false)
                      then nullif(btrim(left(btrim(coalesce(p_gift_message, '')), 240)), '') end;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select m.payment_methods into v_methods from public.markets m where m.id = p_market;
  if v_methods is null then
    raise exception 'unknown_market' using errcode = '22023';
  end if;
  if not (p_payment_method = any (v_methods)) then
    raise exception 'payment_method_unavailable' using errcode = '22023';
  end if;

  if v_name is null or v_phone !~ '^\+?[0-9]{10,15}$' or v_line1 is null or v_city is null
     or v_state is null or (p_market = 'IN' and v_line2 is null) then
    raise exception 'invalid_shipping_address' using errcode = '22023';
  end if;
  if not private.valid_postcode(p_market, v_postcode) then
    raise exception 'invalid_postcode' using errcode = '22023';
  end if;

  -- a fresh checkout abandons any earlier unpaid one in this store
  perform private.cancel_order(o.id)
  from public.orders o
  where o.user_id = v_uid and o.market_id = p_market and o.status = 'awaiting_payment';

  select c.id into v_cart from public.carts c where c.user_id = v_uid and c.market_id = p_market;
  if v_cart is null or not exists (select 1 from public.cart_items ci where ci.cart_id = v_cart) then
    raise exception 'cart_empty' using errcode = 'P0001';
  end if;

  -- lock in a stable order (deadlock-safe) and verify every line is on sale and in stock
  for v_line in
    select ci.product_id, ci.qty, p.stock, p.archived_at
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart
    order by ci.product_id
    for update of p
  loop
    if v_line.archived_at is not null then
      raise exception 'product_unavailable' using errcode = 'P0001', detail = v_line.product_id;
    end if;
    if v_line.stock < v_line.qty then
      raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_line.product_id;
    end if;
  end loop;

  select coalesce(sum(p.price_minor * ci.qty), 0)::integer into v_sub
  from public.cart_items ci join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart;
  select * into v_t from public.order_totals(p_market, v_sub);

  v_order_id := private.new_order_id(p_market);
  v_status := case when p_payment_method = 'card' then 'awaiting_payment' else 'placed' end;

  insert into public.orders (
    id, user_id, market_id, currency, status, payment_method, payment_label,
    subtotal_minor, ship_minor, tax_minor, total_minor,
    ship_name, ship_phone, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postcode,
    gift, gift_message, placed_at
  )
  values (
    v_order_id, v_uid, p_market, (select m.currency from public.markets m where m.id = p_market),
    v_status, p_payment_method,
    case p_payment_method
      when 'card' then 'Card'
      when 'giftcard' then 'Amazon gift card balance'
      when 'upi' then 'UPI'
      when 'netbanking' then 'Net banking'
      when 'cod' then 'Cash on Delivery'
      when 'emi' then 'EMI'
      when 'amazonpay' then 'Amazon Pay balance'
    end,
    v_t.subtotal_minor, v_t.ship_minor, v_t.tax_minor, v_t.total_minor,
    v_name, v_phone, v_line1, v_line2, v_landmark, v_city, v_state, v_postcode,
    v_gift, v_note,
    case when v_status = 'placed' then now() end
  );

  insert into public.order_items (order_id, line_no, product_id, title, image, seller, unit_price_minor, qty)
  select v_order_id,
         row_number() over (order by ci.added_at, ci.product_id),
         p.id, p.title, p.image, p.seller, p.price_minor, ci.qty
  from public.cart_items ci join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart;

  update public.products p
     set stock = p.stock - ci.qty
    from public.cart_items ci
   where ci.cart_id = v_cart and p.id = ci.product_id;

  if v_status = 'placed' then
    delete from public.cart_items ci where ci.cart_id = v_cart;
  end if;

  return private.order_json(v_order_id);
end
$$;

revoke execute on function public.place_order(text, text, jsonb, boolean, text) from public, anon;
grant execute on function public.place_order(text, text, jsonb, boolean, text) to authenticated, service_role;
