-- Photos on reviews, as on Amazon: a shopper adds up to 5 photos to their review, shown with it and
-- in the product's "Customer images". Files live in the public review-photos bucket under the
-- author's own folder (<user id>/<random>.<ext>); reviews.photos keeps their paths, in order.

alter table public.reviews
  add column photos text[] not null default '{}',
  add constraint reviews_photos_max check (cardinality(photos) <= 5);

create index reviews_with_photos_idx on public.reviews (product_id, created_at desc) where photos <> '{}';

-- ---------------------------------------------------------------------------
-- review-photos: anyone can read (public URLs); shoppers write only their own folder.
-- Admins can delete any (a deleted review takes its photos with it).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "shoppers read own review photos" on storage.objects
  for select to authenticated using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "shoppers upload review photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "shoppers delete own review photos" on storage.objects
  for delete to authenticated using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "admins read review photos" on storage.objects
  for select to authenticated using (bucket_id = 'review-photos' and (select public.is_admin()));
create policy "admins delete review photos" on storage.objects
  for delete to authenticated using (bucket_id = 'review-photos' and (select public.is_admin()));

-- A shopper's review can only show photos they uploaded: each one a file in their own folder,
-- no repeats. Trusted writes (seed, service role) and moderation pass through.
create function public.reviews_photos_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_path text;
begin
  if v_uid is null or current_setting('app.review_moderation', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.photos is not distinct from old.photos then
    return new;
  end if;
  if new.photos is null then
    new.photos := '{}';
  end if;
  if cardinality(new.photos) > 5
     or (select count(distinct p) from unnest(new.photos) p) <> cardinality(new.photos) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'photos';
  end if;
  foreach v_path in array new.photos loop
    if v_path !~ ('^' || v_uid::text || '/[0-9a-f]{24}\.(jpg|png|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'review-photos' and o.name = v_path) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'photos';
    end if;
  end loop;
  return new;
end
$$;

create trigger reviews_photos_check
  before insert or update of photos on public.reviews
  for each row execute function public.reviews_photos_check();

revoke execute on function public.reviews_photos_check() from public, anon, authenticated;

-- The moderation queue shows a review's photos; deleting one says which photos to clear away.
create or replace function public.admin_review_queue(
  p_market    text,
  p_view      text default 'reported',
  p_page      integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_view text := coalesce(p_view, 'reported');
  v_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_out  jsonb;
begin
  perform private.require_admin();
  if v_view not in ('reported', 'hidden') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'view';
  end if;

  with base as (
    select r.id, r.product_id, p.title as product_title, r.author_name, r.rating, r.title, r.body,
           r.verified, r.seeded, r.helpful_count, r.created_at, r.hidden_at, r.hidden_reason, r.moderated_at, r.photos,
           rep.open_reports, rep.last_reported_at, rep.reasons
    from public.reviews r
    join public.products p on p.id = r.product_id
    left join lateral (
      select sum(g.n)::integer as open_reports, max(g.last_at) as last_reported_at, jsonb_object_agg(g.reason, g.n) as reasons
      from (
        select rr.reason, count(*) as n, max(rr.created_at) as last_at
        from public.review_reports rr
        where rr.review_id = r.id and rr.created_at > coalesce(r.moderated_at, '-infinity'::timestamptz)
        group by rr.reason
      ) g
    ) rep on true
    where p.market_id = p_market
  ),
  hit as (
    select b.* from base b
    where (v_view = 'reported' and coalesce(b.open_reports, 0) > 0) or (v_view = 'hidden' and b.hidden_at is not null)
  ),
  page as (
    select h.* from hit h
    order by
      case when v_view = 'reported' then h.open_reports end desc nulls last,
      case when v_view = 'reported' then h.last_reported_at else h.hidden_at end desc,
      h.id
    limit v_size offset (v_page - 1) * v_size
  )
  select jsonb_build_object(
    'reviews', coalesce((select jsonb_agg(to_jsonb(pg)) from page pg), '[]'::jsonb),
    'total', (select count(*) from hit),
    'page', v_page,
    'page_size', v_size,
    'counts', (
      select jsonb_build_object(
        'reported', count(*) filter (where open_reports > 0),
        'hidden', count(*) filter (where hidden_at is not null)
      ) from base
    )
  ) into v_out;
  return v_out;
end
$$;

create or replace function public.admin_moderate_review(p_review_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.reviews;
begin
  perform private.require_admin();
  if p_action not in ('keep', 'hide', 'delete') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'action';
  end if;
  perform set_config('app.review_moderation', 'on', true);

  if p_action = 'delete' then
    delete from public.reviews r where r.id = p_review_id returning * into v_row;
  else
    update public.reviews r
       set hidden_at = case when p_action = 'hide' then coalesce(r.hidden_at, now()) end,
           hidden_reason = case when p_action = 'hide' then 'admin' end,
           moderated_at = now()
     where r.id = p_review_id
    returning * into v_row;
  end if;

  perform set_config('app.review_moderation', 'off', true);
  if v_row.id is null then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', v_row.id,
    'deleted', p_action = 'delete',
    'hidden_at', case when p_action = 'delete' then null else v_row.hidden_at end,
    'hidden_reason', case when p_action = 'delete' then null else v_row.hidden_reason end,
    'moderated_at', case when p_action = 'delete' then null else v_row.moderated_at end,
    'photos', to_jsonb(v_row.photos)
  );
end
$$;
