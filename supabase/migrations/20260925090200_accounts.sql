-- Accounts: a profile per auth user and a per-store address book.

-- ---------------------------------------------------------------------------
-- profiles — created automatically for every new auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Customer'
    ), 80)
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, delete, truncate on public.profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- addresses — up to 5 per user per store, exactly one default when any exist
-- ---------------------------------------------------------------------------
create table public.addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  market_id  text not null references public.markets (id),
  full_name  text not null check (char_length(full_name) between 1 and 80),
  phone      text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  line1      text not null check (char_length(line1) between 1 and 120),
  line2      text check (char_length(line2) <= 120),
  landmark   text check (char_length(landmark) <= 80),
  city       text not null check (char_length(city) between 1 and 60),
  state      text not null check (char_length(state) between 1 and 60),
  postcode   text not null,
  kind       text check (kind in ('home', 'office')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addresses_postcode_format check (private.valid_postcode(market_id, postcode)),
  constraint addresses_in_needs_area check (market_id <> 'IN' or line2 is not null)
);

create index addresses_user_market_idx on public.addresses (user_id, market_id, created_at);
create unique index addresses_one_default on public.addresses (user_id, market_id) where is_default;

create function public.addresses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.addresses a
        where a.user_id = new.user_id and a.market_id = new.market_id) >= 5 then
      raise exception 'address_limit' using errcode = 'P0001', hint = 'At most 5 saved addresses per store.';
    end if;
    -- the first address in a store is always the default
    if not exists (select 1 from public.addresses a
                   where a.user_id = new.user_id and a.market_id = new.market_id) then
      new.is_default := true;
    end if;
  else
    new.user_id := old.user_id;
    new.market_id := old.market_id;
    new.created_at := old.created_at;
    new.updated_at := now();
    -- a direct update can't leave the store without a default (nested updates
    -- from the swap below are allowed to clear it)
    if old.is_default and not new.is_default and pg_trigger_depth() = 1 then
      new.is_default := true;
    end if;
  end if;

  if new.is_default then
    update public.addresses a
       set is_default = false
     where a.user_id = new.user_id
       and a.market_id = new.market_id
       and a.is_default
       and a.id <> new.id;
  end if;
  return new;
end
$$;

create trigger addresses_before_write
  before insert or update on public.addresses
  for each row execute function public.addresses_before_write();

-- deleting the default promotes the oldest remaining address
create function public.addresses_after_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_default then
    update public.addresses a
       set is_default = true
     where a.id = (
       select a2.id from public.addresses a2
       where a2.user_id = old.user_id and a2.market_id = old.market_id
       order by a2.created_at, a2.id
       limit 1
     );
  end if;
  return null;
end
$$;

create trigger addresses_after_delete
  after delete on public.addresses
  for each row execute function public.addresses_after_delete();

alter table public.addresses enable row level security;

create policy "own addresses: select" on public.addresses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own addresses: insert" on public.addresses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own addresses: update" on public.addresses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "own addresses: delete" on public.addresses
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.addresses from anon;
