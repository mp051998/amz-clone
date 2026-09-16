-- amz-clone database schema (Supabase / Postgres)
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Products live in code (lib/catalog*.ts), so product_id columns are plain text
-- catalog ids (e.g. "71F2ccIPPLL", "in-61BWskzWNIL") with no FK to a products table.
--
-- Auth is Supabase Auth (email + password). Every row is owned by auth.uid();
-- row-level security keeps each user to their own data. Reviews are world-readable
-- but only writable by their author. Carts and orders are country-scoped via `market`.

-- ---------------------------------------------------------------------------
-- addresses: a per-user address book, reused at checkout
-- ---------------------------------------------------------------------------
create table if not exists public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  phone       text,
  line1       text not null,
  line2       text,
  landmark    text,
  city        text not null,
  state       text,
  postcode    text not null,
  country     text not null default 'US',       -- 'US' | 'IN'
  type        text,                              -- 'home' | 'office'
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses(user_id);

-- ---------------------------------------------------------------------------
-- cart_items: server-side cart, one row per (user, product, market)
-- ---------------------------------------------------------------------------
create table if not exists public.cart_items (
  user_id    uuid not null references auth.users(id) on delete cascade,
  market     text not null,                      -- 'US' | 'IN' (keeps .com and .in carts separate)
  product_id text not null,
  qty        integer not null check (qty > 0),
  added_at   timestamptz not null default now(),
  primary key (user_id, market, product_id)
);

-- ---------------------------------------------------------------------------
-- orders + order_items: placed orders, tied to the user
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id         text primary key,                   -- human order number, e.g. 114-1234567-1234567
  user_id    uuid not null references auth.users(id) on delete cascade,
  market     text not null,                      -- 'US' | 'IN'
  currency   text not null,                       -- 'USD' | 'INR'
  subtotal   integer not null,                    -- all money in minor units (cents / paise)
  shipping   integer not null,
  tax        integer not null,
  total      integer not null,
  ship_name  text not null,
  ship_city  text,
  ship_zip   text,
  pay_label  text,                                -- "Visa ending 4242", "UPI", "Cash on Delivery"...
  created_at timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders(user_id, created_at desc);

create table if not exists public.order_items (
  id          bigint generated always as identity primary key,
  order_id    text not null references public.orders(id) on delete cascade,
  product_id  text not null,
  qty         integer not null check (qty > 0),
  unit_price  integer not null                     -- minor units, in the order's currency
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- ---------------------------------------------------------------------------
-- reviews: product reviews (world-readable, author-writable)
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  text not null,
  rating      integer not null check (rating between 1 and 5),
  title       text,
  body        text,
  author_name text,
  created_at  timestamptz not null default now()
);
create index if not exists reviews_product_idx on public.reviews(product_id, created_at desc);
create unique index if not exists reviews_one_per_user_product on public.reviews(user_id, product_id);

-- ===========================================================================
-- Row-level security
-- ===========================================================================
alter table public.addresses  enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders     enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews    enable row level security;

-- addresses: owner-only, full access
create policy "addresses owner" on public.addresses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cart_items: owner-only, full access
create policy "cart owner" on public.cart_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- orders: owner can read + insert their own (no update/delete from the client)
create policy "orders read own" on public.orders
  for select using (auth.uid() = user_id);
create policy "orders insert own" on public.orders
  for insert with check (auth.uid() = user_id);

-- order_items: readable/insertable when the parent order belongs to the user
create policy "order_items read own" on public.order_items
  for select using (exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()
  ));
create policy "order_items insert own" on public.order_items
  for insert with check (exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()
  ));

-- reviews: anyone (even signed-out) may read; only the author may write their own
create policy "reviews read all" on public.reviews
  for select using (true);
create policy "reviews insert own" on public.reviews
  for insert with check (auth.uid() = user_id);
create policy "reviews update own" on public.reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reviews delete own" on public.reviews
  for delete using (auth.uid() = user_id);
