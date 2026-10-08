-- Following brands, as on Amazon's brand stores: "Follow" on a brand's store keeps it in the
-- shopper's "Brands you follow", with what's new from each. A follow is per store (each sells
-- its own catalog) and only of a brand with something on sale there. Shoppers read their own
-- follows; following and unfollowing go through the RPCs below.
-- ---------------------------------------------------------------------------

create table public.brand_follows (
  user_id     uuid not null references auth.users (id) on delete cascade,
  market_id   text not null references public.markets (id),
  brand       text not null check (char_length(brand) between 1 and 120),
  followed_at timestamptz not null default now(),
  primary key (user_id, market_id, brand)
);

alter table public.brand_follows enable row level security;

create policy "read own brand follows" on public.brand_follows
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.brand_follows from anon, authenticated;
revoke all on public.brand_follows from anon;

-- ---------------------------------------------------------------------------
-- follow_brand: follow a brand in a store, by its name as the catalog spells it. not_found
-- (detail 'brand') when nothing of it is on sale there. Following again keeps the first date.
-- Returns the brand's name.
-- ---------------------------------------------------------------------------
create or replace function public.follow_brand(p_market text, p_brand text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand text := btrim(coalesce(p_brand, ''));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_brand = '' or char_length(v_brand) > 120 or not exists (
    select 1 from public.products p
    where p.market_id = p_market and p.brand = v_brand and p.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'brand';
  end if;
  insert into public.brand_follows (user_id, market_id, brand)
  values (auth.uid(), p_market, v_brand)
  on conflict do nothing;
  return v_brand;
end
$$;

-- ---------------------------------------------------------------------------
-- unfollow_brand: stop following; whether the caller was following it.
-- ---------------------------------------------------------------------------
create or replace function public.unfollow_brand(p_market text, p_brand text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.brand_follows f
  where f.user_id = auth.uid() and f.market_id = p_market and f.brand = btrim(coalesce(p_brand, ''));
  get diagnostics v_n = row_count;
  return v_n > 0;
end
$$;

revoke execute on function public.follow_brand(text, text) from public, anon;
revoke execute on function public.unfollow_brand(text, text) from public, anon;
grant execute on function public.follow_brand(text, text) to authenticated, service_role;
grant execute on function public.unfollow_brand(text, text) to authenticated, service_role;
