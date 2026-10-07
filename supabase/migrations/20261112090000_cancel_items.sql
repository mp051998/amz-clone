-- "Cancel items", as on Amazon: until an order ships, its owner can cancel some of its items and
-- keep the rest coming. The cancelled lines move from order_items to order_cancelled_items, under
-- an order_cancellations row that carries their refund the way a return carries its own: what the
-- items cost after any coupon, plus the tax that no longer applies. The order is repriced over the
-- lines left (delivery never goes up), so everything that reads an order (returns, invoices,
-- verified reviews, seller feedback, buy again) sees only what's still coming, and a later full
-- cancel refunds what's left. Cancelling every line is cancelling the order, as before.
--
-- Refunds follow the order's payment method, as a full cancel's do: a card refund is 'pending'
-- until the server has refunded it on Stripe (record_cancellation_refund), cash on delivery was
-- never charged ('not_charged'), and the other methods are refunded at once, a store balance
-- straight back to the balance.

create table public.order_cancellations (
  id               uuid primary key default gen_random_uuid(),
  order_id         text not null references public.orders (id) on delete cascade,
  items_minor      integer not null check (items_minor >= 0),
  tax_minor        integer not null default 0 check (tax_minor >= 0),
  refund_minor     integer generated always as (items_minor + tax_minor) stored,
  refund_status    text not null check (refund_status in ('pending', 'succeeded', 'failed', 'not_charged')),
  stripe_refund_id text,
  refunded_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index order_cancellations_order_idx on public.order_cancellations (order_id, created_at);

create table public.order_cancelled_items (
  cancellation_id     uuid not null references public.order_cancellations (id) on delete cascade,
  order_id            text not null references public.orders (id) on delete cascade,
  line_no             integer not null,
  product_id          text not null references public.products (id),
  title               text not null,
  image               text not null,
  seller              text not null,
  unit_price_minor    integer not null check (unit_price_minor >= 0),
  unit_discount_minor integer not null default 0 check (unit_discount_minor >= 0),
  qty                 integer not null check (qty > 0),
  primary key (cancellation_id, product_id)
);

create index order_cancelled_items_order_idx on public.order_cancelled_items (order_id);

alter table public.order_cancellations enable row level security;
alter table public.order_cancelled_items enable row level security;

create policy "own order cancellations" on public.order_cancellations
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );
create policy "own cancelled items" on public.order_cancelled_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

revoke insert, update, delete, truncate on public.order_cancellations, public.order_cancelled_items from anon, authenticated;
revoke all on public.order_cancellations, public.order_cancelled_items from anon;

-- An order's JSON (every order RPC returns it) lists its cancellations, oldest first.
create or replace function private.order_json(p_order_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(o) || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(oi) - 'order_id' order by oi.line_no)
      from public.order_items oi where oi.order_id = o.id), '[]'::jsonb),
    'cancellations', coalesce((
      select jsonb_agg(to_jsonb(c) || jsonb_build_object('items', coalesce((
          select jsonb_agg(to_jsonb(ci) - 'order_id' - 'cancellation_id' order by ci.line_no)
          from public.order_cancelled_items ci where ci.cancellation_id = c.id), '[]'::jsonb))
        order by c.created_at, c.id)
      from public.order_cancellations c where c.order_id = o.id), '[]'::jsonb))
  from public.orders o
  where o.id = p_order_id
$$;

/**
 * Shopper cancels some items of one of their orders until it ships: `p_product_ids` are the
 * lines to cancel, each whole. Raises invalid_input (detail 'items') for none or for a product
 * that isn't in the order, order_not_cancellable once it has shipped (or isn't placed). All of
 * its lines is a full cancel. Returns the order.
 */
create function public.cancel_my_items(p_order_id text, p_product_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.orders;
  v_ids     text[];
  v_lines   integer;
  v_picked  integer;
  v_sub     integer;
  v_disc    integer;
  v_tax     integer;
  v_items   integer;
  v_status  text;
  v_id      uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_product_ids, '{}'::text[])) x where x is not null;
  if v_ids is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;

  select * into v_o from public.orders o where o.id = p_order_id and o.user_id = auth.uid() for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_o.status <> 'placed'
     or private.order_stage(v_o.status, v_o.shipped_at, v_o.out_for_delivery_at, v_o.delivered_at) <> 'preparing' then
    raise exception 'order_not_cancellable' using errcode = 'P0001';
  end if;

  select count(*), count(*) filter (where oi.product_id = any (v_ids))
    into v_lines, v_picked
    from public.order_items oi where oi.order_id = p_order_id;
  if v_picked <> cardinality(v_ids) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;
  if v_picked = v_lines then
    perform private.cancel_placed_order(p_order_id, 'customer');
    return private.order_json(p_order_id);
  end if;

  -- the order repriced over the lines left; tax only ever goes down, delivery stays as charged
  select coalesce(sum(oi.unit_price_minor * oi.qty), 0), coalesce(sum(oi.unit_discount_minor * oi.qty), 0)
    into v_sub, v_disc
    from public.order_items oi where oi.order_id = p_order_id and not (oi.product_id = any (v_ids));
  select least(v_o.tax_minor, case when m.tax_inclusive then 0 else round((v_sub - v_disc) * m.tax_rate_bps / 10000.0)::integer end)
    into v_tax
    from public.markets m where m.id = v_o.market_id;
  select coalesce(sum((oi.unit_price_minor - oi.unit_discount_minor) * oi.qty), 0)
    into v_items
    from public.order_items oi where oi.order_id = p_order_id and oi.product_id = any (v_ids);

  v_status := case v_o.payment_method when 'card' then 'pending' when 'cod' then 'not_charged' else 'succeeded' end;
  insert into public.order_cancellations (order_id, items_minor, tax_minor, refund_status, refunded_at)
  values (p_order_id, v_items, v_o.tax_minor - v_tax, v_status, case when v_status = 'succeeded' then now() end)
  returning id into v_id;

  insert into public.order_cancelled_items
    (cancellation_id, order_id, line_no, product_id, title, image, seller, unit_price_minor, unit_discount_minor, qty)
  select v_id, oi.order_id, oi.line_no, oi.product_id, oi.title, oi.image, oi.seller, oi.unit_price_minor, oi.unit_discount_minor, oi.qty
    from public.order_items oi where oi.order_id = p_order_id and oi.product_id = any (v_ids);

  update public.products p
     set stock = p.stock + oi.qty
    from public.order_items oi
   where oi.order_id = p_order_id and oi.product_id = any (v_ids) and p.id = oi.product_id;

  delete from public.order_items oi where oi.order_id = p_order_id and oi.product_id = any (v_ids);

  update public.orders o
     set subtotal_minor = v_sub,
         discount_minor = v_disc,
         tax_minor = v_tax,
         total_minor = v_sub - v_disc + o.ship_minor + v_tax
   where o.id = p_order_id;

  -- paid from the store balance: straight back to it
  if v_o.payment_method in ('giftcard', 'amazonpay') and v_items + v_o.tax_minor - v_tax > 0
     and exists (select 1 from public.balance_entries e where e.order_id = p_order_id and e.kind = 'order') then
    perform private.move_balance(v_o.user_id, v_o.market_id, v_items + v_o.tax_minor - v_tax, 'refund', null, p_order_id);
  end if;

  return private.order_json(p_order_id);
end
$$;

-- Stripe's word on a cancellation's refund. A late 'pending' never overwrites 'succeeded', and a
-- failure reported for some other (older) refund than the one on record is ignored.
create function public.record_cancellation_refund(p_cancellation_id uuid, p_refund_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'succeeded', 'failed') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  update public.order_cancellations c
     set stripe_refund_id = coalesce(p_refund_id, c.stripe_refund_id),
         refund_status = p_status,
         refunded_at = case when p_status = 'succeeded' then coalesce(c.refunded_at, now()) end
   where c.id = p_cancellation_id
     and c.refund_status in ('pending', 'succeeded', 'failed')
     and not (c.refund_status = 'succeeded' and p_status = 'pending')
     and not (p_status = 'failed' and p_refund_id is not null and c.stripe_refund_id is not null
              and c.stripe_refund_id <> p_refund_id);
end
$$;

revoke execute on function public.cancel_my_items(text, text[]) from public, anon;
revoke execute on function public.record_cancellation_refund(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_my_items(text, text[]) to authenticated;
grant execute on function public.record_cancellation_refund(uuid, text, text) to service_role;
