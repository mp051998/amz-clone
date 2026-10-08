/*
 * Pre-order Price Guarantee, as on Amazon: a shopper who pre-orders an item pays the lowest price
 * it sells for between their order and the end of its release day (in the store's time zone).
 * When an admin lowers the price of an item that was pre-ordered, every order still holding it at
 * a higher price gets the difference back: the line comes down (order_items.unit_guarantee_minor,
 * part of its unit_discount_minor), the order is repriced as cancelling items reprices it (tax
 * only ever goes down, delivery stays as charged), and the difference is refunded as cancelled
 * items are, by an order_cancellations row of kind 'price_guarantee'. So card refunds (asked of
 * Stripe by the server after the price change), split payments, store balances, Pay Later and the
 * refund webhook all work as they do for cancelled items. A Lightning Deal's price doesn't count:
 * it's for a few hours and a limited number of units. Orders already delivered, cancelled or
 * still awaiting payment stay as they are.
 */

alter table public.order_items
  add column unit_guarantee_minor integer not null default 0 check (unit_guarantee_minor >= 0);

comment on column public.order_items.unit_guarantee_minor is
  'Pre-order Price Guarantee: how much the unit price has come down since it was ordered (part of unit_discount_minor)';

-- A price guarantee refund names the item and the lower price it was honored at; it has no
-- cancelled items of its own.
alter table public.order_cancellations
  add column kind text not null default 'items' check (kind in ('items', 'price_guarantee')),
  add column product_id text references public.products (id),
  add column title text,
  add column price_minor integer check (price_minor >= 0),
  add column qty integer check (qty > 0),
  add constraint order_cancellations_guarantee_fields check (
    kind = 'items' or (product_id is not null and title is not null and price_minor is not null and qty is not null)
  );

/**
 * Honor the guarantee on every order that pre-ordered p_product_id, now that it sells for
 * p_price. Returns how many orders it refunded.
 */
create function private.honor_price_guarantee(p_product_id text, p_price integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id text;
  v_o        public.orders;
  v_items    integer;
  v_qty      integer;
  v_title    text;
  v_sub      integer;
  v_disc     integer;
  v_tax      integer;
  v_refund   integer;
  v_status   text;
  v_n        integer := 0;
begin
  for v_order_id in
    select distinct o.id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      join public.products p on p.id = oi.product_id
      join public.markets m on m.id = o.market_id
     where oi.product_id = p_product_id
       and o.status = 'placed'
       and p.release_at is not null
       and o.placed_at < p.release_at
       and now() < (((p.release_at at time zone m.time_zone)::date + 1)::timestamp at time zone m.time_zone)
       and (o.delivered_at is null or o.delivered_at > now())
       and oi.unit_price_minor - oi.unit_guarantee_minor > p_price
       and oi.unit_price_minor > oi.unit_discount_minor
     order by o.id
  loop
    select * into v_o from public.orders o where o.id = v_order_id for update;
    if v_o.status <> 'placed' then
      continue;
    end if;

    -- each line down to the new price, never below nothing
    with lowered as (
      update public.order_items oi
         set unit_discount_minor = oi.unit_discount_minor + x.d,
             unit_guarantee_minor = oi.unit_guarantee_minor + x.d
        from (
          select i.line_no,
                 least(i.unit_price_minor - i.unit_guarantee_minor - p_price, i.unit_price_minor - i.unit_discount_minor) as d
            from public.order_items i
           where i.order_id = v_order_id and i.product_id = p_product_id
        ) x
       where oi.order_id = v_order_id and oi.line_no = x.line_no and x.d > 0
      returning oi.qty, x.d, oi.title
    )
    select coalesce(sum(l.qty * l.d), 0), coalesce(sum(l.qty), 0), min(l.title)
      into v_items, v_qty, v_title
      from lowered l;
    if v_items = 0 then
      continue;
    end if;

    -- the order repriced: tax only ever goes down, delivery stays as charged
    select coalesce(sum(oi.unit_price_minor * oi.qty), 0), coalesce(sum(oi.unit_discount_minor * oi.qty), 0)
      into v_sub, v_disc
      from public.order_items oi where oi.order_id = v_order_id;
    select least(v_o.tax_minor, case when m.tax_inclusive then 0 else round((v_sub - v_disc) * m.tax_rate_bps / 10000.0)::integer end)
      into v_tax
      from public.markets m where m.id = v_o.market_id;
    v_refund := v_items + v_o.tax_minor - v_tax;

    update public.orders o
       set discount_minor = o.discount_minor + v_items,
           tax_minor = v_tax,
           total_minor = o.total_minor - v_refund
     where o.id = v_order_id;

    v_status := case v_o.payment_method when 'card' then 'pending' when 'cod' then 'not_charged' else 'succeeded' end;
    insert into public.order_cancellations
      (order_id, kind, product_id, title, price_minor, qty, items_minor, tax_minor, refund_status, refunded_at)
    values
      (v_order_id, 'price_guarantee', p_product_id, v_title, p_price, v_qty, v_items, v_o.tax_minor - v_tax,
       v_status, case when v_status = 'succeeded' then now() end);

    -- paid from the store balance: straight back to it
    if v_o.payment_method in ('giftcard', 'amazonpay')
       and exists (select 1 from public.balance_entries e where e.order_id = v_order_id and e.kind = 'order') then
      perform private.move_balance(v_o.user_id, v_o.market_id, v_refund, 'refund', null, v_order_id);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

revoke execute on function private.honor_price_guarantee(text, integer) from public, anon, authenticated;

-- An admin's new price (not a Lightning Deal's) on an item with a release date. Any change can be
-- a drop for someone: an admin repricing mid-deal raises it from the deal's price, but maybe not
-- back to what the pre-orders paid.
create function private.products_price_guarantee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.lightning_deal', true), '') <> 'on' then
    perform private.honor_price_guarantee(new.id, new.price_minor);
  end if;
  return null;
end
$$;

revoke execute on function private.products_price_guarantee() from public, anon, authenticated;

create trigger products_price_guarantee
  after update of price_minor on public.products
  for each row
  when (new.price_minor is distinct from old.price_minor and new.release_at is not null)
  execute function private.products_price_guarantee();
