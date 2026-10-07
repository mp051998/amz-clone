/*
 * "Movers & Shakers", as on Amazon's Best Sellers pages: the products climbing the store's sales
 * ranks fastest. A product's sales rank is its place by units sold in placed orders (what's still
 * coming after any cancelled items), ties sharing a place; this week's rank (the last 7 days) is
 * compared with last week's (the 7 days before). Only products that climbed are listed, the
 * biggest climb first, as a share of where they are now: from #40 to #4 is 900%. A product that
 * didn't sell last week ("previously unranked") climbs from below everything sold in either week.
 *
 * Amazon's chart covers a day; this store sells less, so it covers a week. Units sold never leave
 * the database, only the ranks.
 */

create function public.movers_and_shakers(p_market text, p_category text default null, p_limit integer default 40)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with sales as (
    select oi.product_id,
           coalesce(sum(oi.qty) filter (where o.placed_at > now() - interval '7 days'), 0) as this_week,
           coalesce(sum(oi.qty) filter (where o.placed_at <= now() - interval '7 days'), 0) as last_week
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.catalog_products p on p.id = oi.product_id
    where o.market_id = p_market
      and o.status = 'placed'
      and o.placed_at > now() - interval '14 days'
      and o.placed_at <= now()
      and p.market_id = p_market
      and (p_category is null or p.category_slug = p_category)
    group by oi.product_id
  ),
  now_ranked as (
    select s.product_id, s.this_week, rank() over (order by s.this_week desc) as rank
    from sales s
    where s.this_week > 0
  ),
  was_ranked as (
    select s.product_id, rank() over (order by s.last_week desc) as rank
    from sales s
    where s.last_week > 0
  ),
  movers as (
    select n.product_id, n.rank, w.rank as was_rank, n.this_week,
           coalesce(w.rank, (select count(*) from sales) + 1) as from_rank
    from now_ranked n
    left join was_ranked w on w.product_id = n.product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id', m.product_id, 'rank', m.rank, 'was_rank', m.was_rank)
                            order by m.gain desc, m.this_week desc, m.position, m.product_id), '[]'::jsonb)
  from (
    select m.*, (m.from_rank - m.rank)::numeric / m.rank as gain, p.position
    from movers m
    join public.catalog_products p on p.id = m.product_id
    where m.rank < m.from_rank
    order by gain desc, m.this_week desc, p.position, m.product_id
    limit least(greatest(coalesce(p_limit, 40), 1), 100)
  ) m
$$;

revoke execute on function public.movers_and_shakers(text, text, integer) from public;
grant execute on function public.movers_and_shakers(text, text, integer) to anon, authenticated, service_role;
