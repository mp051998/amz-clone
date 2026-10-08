-- "Fit: Runs small" / "Runs large" on a product that comes in sizes, as Amazon shows beside the
-- size buttons, from what its returns say: now that a return can be for "Too small" or "Too
-- large" (20270120090000_size_exchange.sql), a product whose size returns lean one way says so.
--
-- - product_return_signal() (as in 20261228090000_atoz_claims.sql) adds 'fit': 'small' or
--   'large' when, over the last 90 days' deliveries, at least 3 units came back too small (or too
--   large), at least twice as many as the other way, and size returns are at least 1 delivered
--   unit in 20; else null. Exchanges count: they're returns for size too.

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
      and r.reason not in ('not_received', 'atoz_claim')
  ),
  totals as (
    select
      (select coalesce(sum(s.qty), 0) from sold s) as sold,
      (select coalesce(sum(b.qty), 0) from back b) as returned,
      (select count(distinct b.id) from back b) as returns,
      (select coalesce(sum(b.qty), 0) from back b where b.reason = 'too_small') as small,
      (select coalesce(sum(b.qty), 0) from back b where b.reason = 'too_large') as large
  ),
  verdict as (
    select
      t.sold >= 10 and t.returns >= 2 and t.returned * 10 >= t.sold as frequent,
      t.sold >= 20 and t.returned * 50 <= t.sold as kept,
      case
        when (t.small + t.large) * 20 < t.sold then null
        when t.small >= 3 and t.small >= 2 * t.large then 'small'
        when t.large >= 3 and t.large >= 2 * t.small then 'large'
      end as fit
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
    ) end,
    'fit', v.fit
  )
  from verdict v
$$;
