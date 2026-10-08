-- "Typical price", as amazon.com shows struck through beside a price that has come down when the
-- product has no list price above it: the median price over the last 90 days. That needs each
-- product's price over time, which the store didn't keep.
--
-- - price_history: one row per price a product has had, from when it took effect. Filled in for
--   every product (its current price, from when it was added) and kept up by a trigger on
--   products.price_minor, so admin edits, imports and anything else that reprices it all count.
--   No direct access: it's read through typical_price().
-- - typical_price(p_product): the median of the price in effect at the end of each of the last 90
--   days (today's, so far, included), over the days it had a price; null with fewer than 7 such
--   days or for a product that doesn't exist. In the product's own currency, like price_minor.

create table public.price_history (
  product_id text not null references public.products(id) on delete cascade,
  price_minor integer not null check (price_minor > 0),
  at timestamptz not null default now(),
  primary key (product_id, at)
);

alter table public.price_history enable row level security;
revoke all on public.price_history from anon, authenticated;

insert into public.price_history (product_id, price_minor, at)
select p.id, p.price_minor, p.created_at from public.products p where p.price_minor > 0;

create or replace function private.products_price_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.price_minor is distinct from old.price_minor then
    insert into public.price_history (product_id, price_minor, at)
    values (new.id, new.price_minor, now())
    on conflict (product_id, at) do update set price_minor = excluded.price_minor;
  end if;
  return null;
end;
$$;

create trigger products_price_history
after insert or update of price_minor on public.products
for each row execute function private.products_price_history();

create or replace function public.typical_price(p_product text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select d + interval '1 day' - interval '1 microsecond' as day_end
    from generate_series(date_trunc('day', now()) - interval '89 days', date_trunc('day', now()), interval '1 day') as d
  ),
  daily as (
    select h.price_minor
    from days
    cross join lateral (
      select ph.price_minor
      from public.price_history ph
      where ph.product_id = p_product
        and ph.at <= least(days.day_end, now())
      order by ph.at desc
      limit 1
    ) h
  )
  select case when count(*) >= 7 then percentile_disc(0.5) within group (order by daily.price_minor) end::integer
  from daily
$$;

revoke all on function public.typical_price(text) from public;
grant execute on function public.typical_price(text) to anon, authenticated, service_role;
