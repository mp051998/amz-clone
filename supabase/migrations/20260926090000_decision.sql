-- Decision support: per-product insights (attribute scores, pros/cons, review
-- themes), customer collections with price-at-save tracking, and a server-only
-- cache for AI results. See docs/superpowers/plans/2026-09-26-decision-store-redesign.md.

-- ---------------------------------------------------------------------------
-- product_insights — one row per product. Seeded by rules
-- (scripts/build-insights.mjs); the server may overwrite a row with an AI
-- review summary (source = 'ai') using the service role.
-- ---------------------------------------------------------------------------
create table public.product_insights (
  product_id text primary key references public.products (id) on delete cascade,
  -- attribute key → 1..5 (keys are per category, lib/decision/attributes.ts)
  scores     jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object'),
  pros       text[] not null default '{}',
  cons       text[] not null default '{}',
  best_for   text not null default '' check (char_length(best_for) <= 120),
  summary    text not null default '' check (char_length(summary) <= 1200),
  -- [{theme, count}]
  praised    jsonb not null default '[]'::jsonb check (jsonb_typeof(praised) = 'array'),
  criticized jsonb not null default '[]'::jsonb check (jsonb_typeof(criticized) = 'array'),
  source     text not null default 'rules' check (source in ('rules', 'ai')),
  updated_at timestamptz not null default now()
);

create trigger product_insights_touch
  before update on public.product_insights
  for each row execute function public.touch_updated_at();

alter table public.product_insights enable row level security;

create policy "insights are public" on public.product_insights
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.product_insights from anon, authenticated;

-- ---------------------------------------------------------------------------
-- collections — a customer's named lists per store. `kind` marks the two
-- system lists the app creates on demand: "Things I'm Considering" (the Save
-- button) and "Saved for later" (from the cart). At most 20 per user.
-- ---------------------------------------------------------------------------
create table public.collections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  market_id  text not null references public.markets (id),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  note       text not null default '' check (char_length(note) <= 500),
  kind       text not null default 'custom' check (kind in ('custom', 'considering', 'later')),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index collections_user_market_idx on public.collections (user_id, market_id, position, created_at);
create unique index collections_unique_name on public.collections (user_id, market_id, lower(btrim(name)));
create unique index collections_one_system_kind on public.collections (user_id, market_id, kind) where kind <> 'custom';

create function public.collections_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    if (select count(*) from public.collections c where c.user_id = new.user_id) >= 20 then
      raise exception 'collection_limit' using errcode = 'P0001', hint = 'At most 20 collections per account.';
    end if;
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.market_id := old.market_id;
    new.kind := old.kind;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger collections_before_write
  before insert or update on public.collections
  for each row execute function public.collections_before_write();

alter table public.collections enable row level security;

create policy "own collections: select" on public.collections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own collections: insert" on public.collections
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own collections: update" on public.collections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "own collections: delete" on public.collections
  for delete to authenticated using (user_id = (select auth.uid()));

revoke truncate on public.collections from authenticated;
revoke all on public.collections from anon;

-- ---------------------------------------------------------------------------
-- collection_items — products in a collection with the price when saved
-- (set by the database from the catalog, never by the client). At most 200
-- per collection, and only products from the collection's store.
-- ---------------------------------------------------------------------------
create table public.collection_items (
  collection_id     uuid not null references public.collections (id) on delete cascade,
  product_id        text not null references public.products (id) on delete cascade,
  saved_price_minor integer not null check (saved_price_minor > 0),
  added_at          timestamptz not null default now(),
  primary key (collection_id, product_id)
);

create index collection_items_product_idx on public.collection_items (product_id);

create function public.collection_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_market text;
  v_price  integer;
begin
  if tg_op = 'UPDATE' then
    -- items are immutable apart from delete + re-add
    new.collection_id := old.collection_id;
    new.product_id := old.product_id;
    new.saved_price_minor := old.saved_price_minor;
    new.added_at := old.added_at;
    return new;
  end if;

  select p.price_minor into v_price
  from public.products p
  join public.collections c on c.id = new.collection_id and c.market_id = p.market_id
  where p.id = new.product_id;
  if v_price is null then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.collection_items i where i.collection_id = new.collection_id) >= 200 then
    raise exception 'collection_item_limit' using errcode = 'P0001', hint = 'At most 200 items per collection.';
  end if;
  new.saved_price_minor := v_price;
  new.added_at := now();
  return new;
end
$$;

create trigger collection_items_before_write
  before insert or update on public.collection_items
  for each row execute function public.collection_items_before_write();

alter table public.collection_items enable row level security;

create policy "own collection items: select" on public.collection_items
  for select to authenticated using (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
  );
create policy "own collection items: insert" on public.collection_items
  for insert to authenticated with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
  );
create policy "own collection items: delete" on public.collection_items
  for delete to authenticated using (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
  );

revoke update, truncate on public.collection_items from authenticated;
revoke all on public.collection_items from anon;

-- ---------------------------------------------------------------------------
-- ai_cache — server-side cache of AI results keyed by sha256(feature, provider,
-- input). Service role only: no policies, no grants to browser roles.
-- ---------------------------------------------------------------------------
create table public.ai_cache (
  key        text primary key check (char_length(key) between 1 and 128),
  feature    text not null,
  provider   text not null,
  value      jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index ai_cache_expires_idx on public.ai_cache (expires_at);

alter table public.ai_cache enable row level security;
revoke all on public.ai_cache from anon, authenticated;
