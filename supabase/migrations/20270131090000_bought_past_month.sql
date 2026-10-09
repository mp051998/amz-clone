-- "1K+ bought in past month", as on Amazon: how many units of each product shoppers bought in the
-- last 30 days, counted from placed orders (cancelled lines have already left order_items). Only
-- products past Amazon's 50-unit floor come back, so a handful of sales never shows and no single
-- shopper's purchase can be read off a product page.
--
-- The label used to be a column typed in by hand (products.bought_past_month), and the seed catalog
-- filled it with made-up numbers; the storefront reads this instead, and the column is left unused.
create function public.bought_past_month(p_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.product_id, s.units), '{}'::jsonb)
  from (
    select oi.product_id, sum(oi.qty) as units
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where oi.product_id = any (p_ids[1:100])
      and o.status = 'placed'
      and o.placed_at > now() - interval '30 days'
      and o.placed_at <= now()
    group by oi.product_id
    having sum(oi.qty) >= 50
  ) s
$$;
revoke execute on function public.bought_past_month(text[]) from public;
grant execute on function public.bought_past_month(text[]) to anon, authenticated, service_role;
