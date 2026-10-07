-- Sales, as Amazon's Business Reports show them: over a store's last N days (its own calendar
-- days, in its time zone), the orders placed, units ordered and ordered product sales (what the
-- items sold for after coupons, before tax and delivery), day by day; the best-selling products;
-- and what came back (returns received in those days, and what was refunded for them). An order
-- cancelled since doesn't count, nor do items cancelled from an order; cancelled orders are
-- counted on their own. Admins only.
create function public.admin_sales(p_market text, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_to date;
  v_from date;
  v_since timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select m.time_zone into v_tz from public.markets m where m.id = p_market;
  if not found then
    raise exception 'unknown_market' using errcode = '22023';
  end if;
  v_to := (now() at time zone v_tz)::date;
  v_from := v_to - (v_days - 1);
  v_since := v_from::timestamp at time zone v_tz;

  return (
    with sold as (
      select o.id as order_id, (o.placed_at at time zone v_tz)::date as day, i.product_id, i.title, i.image, i.qty,
             (i.unit_price_minor - i.unit_discount_minor) * i.qty as sales_minor
      from public.orders o
      join public.order_items i on i.order_id = o.id
      where o.market_id = p_market and o.status = 'placed' and o.placed_at >= v_since
    ),
    back as (
      select r.refund_minor, r.refund_status, (select coalesce(sum(ri.qty), 0) from public.return_items ri where ri.return_id = r.id) as units
      from public.returns r
      join public.orders o on o.id = r.order_id
      where o.market_id = p_market and r.status = 'received' and r.received_at >= v_since
    ),
    per_day as (
      select day, count(distinct order_id) as orders, sum(qty) as units, sum(sales_minor) as sales_minor
      from sold
      group by day
    ),
    top as (
      select product_id, (array_agg(title order by order_id desc))[1] as title, (array_agg(image order by order_id desc))[1] as image,
             count(distinct order_id) as orders, sum(qty) as units, sum(sales_minor) as sales_minor
      from sold
      group by product_id
      order by units desc, sales_minor desc, product_id
      limit 10
    )
    select jsonb_build_object(
      'days', v_days,
      'from', v_from,
      'to', v_to,
      'timeZone', v_tz,
      'totals', jsonb_build_object(
        'orders', (select count(distinct order_id) from sold),
        'units', (select coalesce(sum(qty), 0) from sold),
        'salesMinor', (select coalesce(sum(sales_minor), 0) from sold),
        'cancelledOrders', (
          select count(*) from public.orders o
          where o.market_id = p_market and o.status = 'cancelled' and o.placed_at >= v_since
        ),
        'returns', (select count(*) from back),
        'unitsReturned', (select coalesce(sum(units), 0) from back),
        'refundedMinor', (select coalesce(sum(refund_minor), 0) from back where refund_status = 'succeeded')
      ),
      'byDay', (
        select jsonb_agg(jsonb_build_object(
          'day', d.day, 'orders', coalesce(p.orders, 0), 'units', coalesce(p.units, 0), 'salesMinor', coalesce(p.sales_minor, 0)
        ) order by d.day)
        from (select (v_from + n) as day from generate_series(0, v_days - 1) n) d
        left join per_day p on p.day = d.day
      ),
      'top', coalesce((
        select jsonb_agg(jsonb_build_object(
          'productId', t.product_id, 'title', t.title, 'image', t.image, 'orders', t.orders, 'units', t.units, 'salesMinor', t.sales_minor
        ) order by t.units desc, t.sales_minor desc, t.product_id)
        from top t
      ), '[]'::jsonb)
    )
  );
end
$$;

revoke execute on function public.admin_sales(text, integer) from public, anon;
grant execute on function public.admin_sales(text, integer) to authenticated, service_role;
