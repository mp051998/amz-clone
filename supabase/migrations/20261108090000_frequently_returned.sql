/*
 * "Frequently returned item", as on Amazon's product pages: when a product comes back a lot,
 * its page warns shoppers to check the details and reviews first, and says the usual reason when
 * it's about the product (damaged, defective, wrong item, missing parts, not as described).
 *
 * product_return_signal() looks at the last 90 days: units delivered in orders, and units sent
 * back in those orders (returns not cancelled or rejected). Frequent means at least 10 units
 * delivered, at least 2 separate returns, and at least 1 unit in 10 coming back. Only that flag
 * and the reason leave the database, never counts or who returned what, so anyone may ask.
 */

create function public.product_return_signal(p_product text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with sold as (
    select oi.order_id, oi.qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id = p_product
      and o.status = 'placed'
      and o.delivered_at <= now()
      and o.delivered_at > now() - interval '90 days'
  ),
  back as (
    select r.id, r.reason, ri.qty
    from public.return_items ri
    join public.returns r on r.id = ri.return_id
    where ri.product_id = p_product
      and ri.order_id in (select s.order_id from sold s)
      and r.status not in ('cancelled', 'rejected')
  ),
  totals as (
    select
      (select coalesce(sum(s.qty), 0) from sold s) as sold,
      (select coalesce(sum(b.qty), 0) from back b) as returned,
      (select count(distinct b.id) from back b) as returns
  ),
  verdict as (
    select t.sold >= 10 and t.returns >= 2 and t.returned * 10 >= t.sold as frequent from totals t
  )
  select jsonb_build_object(
    'frequent', v.frequent,
    'reason', case when v.frequent then (
      select b.reason
      from back b
      where b.reason in ('damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described')
      group by b.reason
      order by sum(b.qty) desc, b.reason
      limit 1
    ) end
  )
  from verdict v
$$;

revoke execute on function public.product_return_signal(text) from public;
grant execute on function public.product_return_signal(text) to anon, authenticated, service_role;
