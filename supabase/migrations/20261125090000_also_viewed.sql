/*
 * "Customers who viewed this item also viewed", as on Amazon's product pages.
 *
 * A product page view sends the products that device looked at just before (its browsing
 * history cookie, up to 5, same store); each pair is counted both ways. Views aren't tied to an
 * account or a device, only counted, and a paused history sends nothing. The table has no
 * client access: record_product_view() writes it and also_viewed() reads it, returning only
 * product ids and counts.
 */
create table public.product_coviews (
  product_id     text not null references public.products (id) on delete cascade,
  other_id       text not null references public.products (id) on delete cascade,
  views          integer not null default 1,
  last_viewed_at timestamptz not null default now(),
  primary key (product_id, other_id),
  check (product_id <> other_id)
);

alter table public.product_coviews enable row level security;
-- no policies: only the functions below touch it

create function public.record_product_view(p_product_id text, p_recent text[])
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.product_coviews as c (product_id, other_id)
  select x.a, x.b
  from public.products p
  join public.products r
    on r.market_id = p.market_id
   and r.id <> p.id
   and r.id = any ((coalesce(p_recent, '{}'::text[]))[1:5])
  cross join lateral (values (p.id, r.id), (r.id, p.id)) as x (a, b)
  where p.id = p_product_id
  on conflict (product_id, other_id) do update
    set views = c.views + 1, last_viewed_at = now()
$$;

revoke execute on function public.record_product_view(text, text[]) from public;
grant execute on function public.record_product_view(text, text[]) to anon, authenticated, service_role;

/*
 * The products most often viewed with this one, most views first: on sale in the same store
 * (the view leaves archived ones out), and not another option of its variant group.
 */
create function public.also_viewed(p_product_id text, p_limit integer default 8)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select cp.id, cp.market_id, cp.variant_group
    from public.catalog_products cp
    where cp.id = p_product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'views', x.views) order by x.views desc, x.review_count desc, x.id), '[]'::jsonb)
  from (
    select cv.other_id as id, cv.views, cp.review_count
    from base b
    join public.product_coviews cv on cv.product_id = b.id
    join public.catalog_products cp on cp.id = cv.other_id and cp.market_id = b.market_id
    where b.variant_group is null or cp.variant_group is distinct from b.variant_group
    order by cv.views desc, cp.review_count desc, cv.other_id
    limit least(greatest(coalesce(p_limit, 8), 1), 12)
  ) x
$$;

revoke execute on function public.also_viewed(text, integer) from public;
grant execute on function public.also_viewed(text, integer) to anon, authenticated, service_role;
