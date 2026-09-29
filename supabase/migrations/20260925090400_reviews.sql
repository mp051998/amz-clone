-- Reviews: customer reviews with a server-decided "Verified Purchase" flag,
-- helpful votes, reports, and rating aggregates kept current by triggers.

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references public.products (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  author_name   text not null check (char_length(author_name) between 1 and 60),
  rating        smallint not null check (rating between 1 and 5),
  title         text not null check (char_length(title) between 1 and 120),
  body          text not null check (char_length(body) between 1 and 4000),
  verified      boolean not null default false,
  -- seeded = historical sample review; its rating is already in product_ratings
  seeded        boolean not null default false,
  helpful_count integer not null default 0 check (helpful_count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index reviews_product_top_idx on public.reviews (product_id, helpful_count desc, created_at desc);
create unique index reviews_one_per_user on public.reviews (product_id, user_id) where user_id is not null;

/**
 * Customer writes are normalised here: the author is always the caller, the
 * helpful counter can't be forged, and "verified" is true only when the caller
 * has a placed order containing the product. Trusted writes (seed, service
 * role: no JWT subject) and nested trigger updates pass through untouched.
 */
create function public.reviews_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.user_id := v_uid;
    new.seeded := false;
    new.helpful_count := 0;
    new.created_at := now();
    new.author_name := left(coalesce(
      nullif(btrim(new.author_name), ''),
      (select pr.display_name from public.profiles pr where pr.id = v_uid),
      'Customer'
    ), 60);
  else
    new.user_id := old.user_id;
    new.product_id := old.product_id;
    new.seeded := old.seeded;
    new.helpful_count := old.helpful_count;
    new.created_at := old.created_at;
  end if;

  new.verified := exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.user_id = v_uid and o.status = 'placed' and oi.product_id = new.product_id
  );
  new.updated_at := now();
  return new;
end
$$;

create trigger reviews_before_write
  before insert or update on public.reviews
  for each row execute function public.reviews_before_write();

-- Keep product_ratings in step with customer (non-seeded) reviews.
create function public.reviews_rollup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and not old.seeded then
    insert into public.product_ratings (product_id) values (old.product_id) on conflict do nothing;
    update public.product_ratings r
       set rating_count = r.rating_count - 1,
           rating_sum = r.rating_sum - old.rating,
           star_1 = r.star_1 - (old.rating = 1)::integer,
           star_2 = r.star_2 - (old.rating = 2)::integer,
           star_3 = r.star_3 - (old.rating = 3)::integer,
           star_4 = r.star_4 - (old.rating = 4)::integer,
           star_5 = r.star_5 - (old.rating = 5)::integer
     where r.product_id = old.product_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and not new.seeded then
    insert into public.product_ratings (product_id) values (new.product_id) on conflict do nothing;
    update public.product_ratings r
       set rating_count = r.rating_count + 1,
           rating_sum = r.rating_sum + new.rating,
           star_1 = r.star_1 + (new.rating = 1)::integer,
           star_2 = r.star_2 + (new.rating = 2)::integer,
           star_3 = r.star_3 + (new.rating = 3)::integer,
           star_4 = r.star_4 + (new.rating = 4)::integer,
           star_5 = r.star_5 + (new.rating = 5)::integer
     where r.product_id = new.product_id;
  end if;
  return null;
end
$$;

create trigger reviews_rollup
  after insert or delete or update of rating on public.reviews
  for each row execute function public.reviews_rollup();

alter table public.reviews enable row level security;

create policy "reviews are public" on public.reviews
  for select to anon, authenticated using (true);
create policy "write own review" on public.reviews
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "edit own review" on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "delete own review" on public.reviews
  for delete to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.reviews from anon;

-- ---------------------------------------------------------------------------
-- helpful votes — one per user per review, never on your own review
-- ---------------------------------------------------------------------------
create table public.review_votes (
  review_id  uuid not null references public.reviews (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create index review_votes_user_idx on public.review_votes (user_id);

create function public.review_votes_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.reviews r set helpful_count = r.helpful_count + 1 where r.id = new.review_id;
  else
    update public.reviews r set helpful_count = greatest(r.helpful_count - 1, 0) where r.id = old.review_id;
  end if;
  return null;
end
$$;

create trigger review_votes_count
  after insert or delete on public.review_votes
  for each row execute function public.review_votes_count();

alter table public.review_votes enable row level security;

create policy "see own votes" on public.review_votes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "vote on others' reviews" on public.review_votes
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and not exists (
      select 1 from public.reviews r where r.id = review_id and r.user_id = (select auth.uid())
    )
  );
create policy "retract own vote" on public.review_votes
  for delete to authenticated using (user_id = (select auth.uid()));

revoke update, truncate on public.review_votes from anon, authenticated;
revoke all on public.review_votes from anon;

-- Toggle the caller's helpful vote; returns the new state and count.
create function public.toggle_review_helpful(p_review_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_voted boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reviews r where r.id = p_review_id) then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.reviews r where r.id = p_review_id and r.user_id = v_uid) then
    raise exception 'own_review' using errcode = 'P0001';
  end if;

  delete from public.review_votes v where v.review_id = p_review_id and v.user_id = v_uid;
  if found then
    v_voted := false;
  else
    insert into public.review_votes (review_id, user_id) values (p_review_id, v_uid);
    v_voted := true;
  end if;

  return jsonb_build_object(
    'review_id', p_review_id,
    'helpful', v_voted,
    'helpful_count', (select r.helpful_count from public.reviews r where r.id = p_review_id)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- reports — moderation queue (write-only for customers)
-- ---------------------------------------------------------------------------
create table public.review_reports (
  review_id  uuid not null references public.reviews (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason     text not null default 'other' check (reason in ('spam', 'offensive', 'off_topic', 'other')),
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

alter table public.review_reports enable row level security;

create policy "see own reports" on public.review_reports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "file a report" on public.review_reports
  for insert to authenticated with check (user_id = (select auth.uid()));

revoke update, delete, truncate on public.review_reports from anon, authenticated;
revoke all on public.review_reports from anon;

revoke execute on function public.toggle_review_helpful(uuid) from public, anon;
grant execute on function public.toggle_review_helpful(uuid) to authenticated, service_role;
