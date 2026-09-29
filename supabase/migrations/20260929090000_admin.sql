-- ===========================================================================
-- Store admins: catalog management (add, edit, delete products; product images)
-- ===========================================================================
-- Admin rights live in the database, so every write path (the /admin pages,
-- /api/v1/admin, a direct PostgREST call with a user's JWT) is checked the same
-- way, and removing a row revokes access on the next request.

-- ---------------------------------------------------------------------------
-- admins — one row per admin user. Managed with SQL or the service role only
-- (npm run admin:grant -- <email>); there are no API policies at all.
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- Whether the caller is an admin. SECURITY DEFINER so it can read admins
-- without exposing the table; it only ever answers for auth.uid().
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- products — admins may insert, update and delete. Column grants keep id,
-- market_id and the computed columns fixed after insert (a product never
-- moves between stores, since its price is in that store's currency).
-- ---------------------------------------------------------------------------
grant insert (
  id, market_id, category_slug, title, brand, image, price_minor, list_minor, deal_pct, deal,
  badge, bought_past_month, seller, ships_from, bullets, stock, position
) on public.products to authenticated;

grant update (
  category_slug, title, brand, image, price_minor, list_minor, deal_pct, deal,
  badge, bought_past_month, seller, ships_from, bullets, stock
) on public.products to authenticated;

grant delete on public.products to authenticated;

create policy "admins add products" on public.products
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins edit products" on public.products
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete products" on public.products
  for delete to authenticated using ((select public.is_admin()));

-- A product may only be listed in a category its store carries.
create function public.products_market_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.market_categories
    where market_id = new.market_id and category_slug = new.category_slug
  ) then
    raise exception 'invalid_category' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger products_market_category
  before insert or update of category_slug on public.products
  for each row execute function public.products_market_category();

-- ---------------------------------------------------------------------------
-- product-images — public bucket for images uploaded from the admin pages.
-- Anyone can read (public URLs); only admins can write.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "admins read product images" on storage.objects
  for select to authenticated using (bucket_id = 'product-images' and (select public.is_admin()));
create policy "admins upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "admins replace product images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and (select public.is_admin()));
create policy "admins delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and (select public.is_admin()));
