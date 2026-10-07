/*
 * "Customers usually keep this item", the other side of "Frequently returned item": over the
 * last 90 days, at least 20 units delivered and no more than 1 in 50 sent back (returns not
 * cancelled or rejected; a package that didn't arrive says nothing about the product).
 * product_return_signal() (as in 20261121090000_not_received) gains a `kept` flag; as before only
 * flags and the usual reason leave the database.
 */

create or replace function public.product_return_signal(p_product text)
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
      and r.reason <> 'not_received'
  ),
  totals as (
    select
      (select coalesce(sum(s.qty), 0) from sold s) as sold,
      (select coalesce(sum(b.qty), 0) from back b) as returned,
      (select count(distinct b.id) from back b) as returns
  ),
  verdict as (
    select
      t.sold >= 10 and t.returns >= 2 and t.returned * 10 >= t.sold as frequent,
      t.sold >= 20 and t.returned * 50 <= t.sold as kept
    from totals t
  )
  select jsonb_build_object(
    'frequent', v.frequent,
    'kept', v.kept,
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
