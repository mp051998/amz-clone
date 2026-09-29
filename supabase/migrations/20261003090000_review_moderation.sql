-- ===========================================================================
-- Review moderation: auto-hide after reports, an admin queue, keep/hide/delete
-- ===========================================================================
-- Shoppers could report a review, but nothing read the reports. Now:
--   * Three open reports hide a review (hidden_reason 'reports'). A report is
--     open when it was filed after the review was last moderated, so once an
--     admin keeps a review it takes three new reporters to hide it again.
--   * Hidden reviews leave the public listing and the star rollup. Their
--     author and admins still see them.
--   * Admins work a queue per store (admin_review_queue) and keep, hide or
--     delete (admin_moderate_review). Customers can't change the moderation
--     columns, even on their own review.

alter table public.reviews
  add column hidden_at     timestamptz,
  add column hidden_reason text check (hidden_reason in ('reports', 'admin')),
  add column moderated_at  timestamptz,
  add constraint reviews_hidden_reason_set check ((hidden_at is null) = (hidden_reason is null));

comment on column public.reviews.hidden_at is 'Set while the review is hidden from shoppers (reports or an admin).';
comment on column public.reviews.moderated_at is 'Last admin decision; reports filed before it are resolved.';

create index reviews_hidden_idx on public.reviews (hidden_at desc) where hidden_at is not null;
create index review_reports_open_idx on public.review_reports (review_id, created_at);

-- Customer writes keep the moderation columns as they were (on insert: none).
-- The moderation functions below set app.review_moderation to pass through.
create or replace function public.reviews_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or pg_trigger_depth() > 1 or current_setting('app.review_moderation', true) = 'on' then
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
    new.hidden_at := null;
    new.hidden_reason := null;
    new.moderated_at := null;
  else
    new.user_id := old.user_id;
    new.product_id := old.product_id;
    new.seeded := old.seeded;
    new.helpful_count := old.helpful_count;
    new.created_at := old.created_at;
    new.hidden_at := old.hidden_at;
    new.hidden_reason := old.hidden_reason;
    new.moderated_at := old.moderated_at;
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

-- The rollup counts customer reviews that are visible: hiding one takes its
-- stars out, keeping it puts them back.
create or replace function public.reviews_rollup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and not old.seeded and old.hidden_at is null then
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
  if tg_op in ('INSERT', 'UPDATE') and not new.seeded and new.hidden_at is null then
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

drop trigger reviews_rollup on public.reviews;
create trigger reviews_rollup
  after insert or delete or update of rating, hidden_at on public.reviews
  for each row execute function public.reviews_rollup();

drop policy "reviews are public" on public.reviews;
create policy "visible reviews are public" on public.reviews
  for select to anon, authenticated using (
    hidden_at is null or user_id = (select auth.uid()) or (select public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- Auto-hide: the third open report hides the review.
-- ---------------------------------------------------------------------------
create function public.review_reports_autohide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reviews r
     set hidden_at = now(), hidden_reason = 'reports'
   where r.id = new.review_id
     and r.hidden_at is null
     and (select count(*) from public.review_reports x
           where x.review_id = r.id and x.created_at > coalesce(r.moderated_at, '-infinity'::timestamptz)) >= 3;
  return null;
end
$$;

create trigger review_reports_autohide
  after insert on public.review_reports
  for each row execute function public.review_reports_autohide();

-- ---------------------------------------------------------------------------
-- Admin queue and decisions
-- ---------------------------------------------------------------------------

-- One store's reviews that need a look. 'reported': open reports (hidden or
-- not), most reported first. 'hidden': everything hidden, newest first.
create function public.admin_review_queue(
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
           r.verified, r.seeded, r.helpful_count, r.created_at, r.hidden_at, r.hidden_reason, r.moderated_at,
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

-- keep: visible again, reports so far resolved. hide: hidden by an admin.
-- delete: gone, with its votes and reports.
create function public.admin_moderate_review(p_review_id uuid, p_action text)
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
    'moderated_at', case when p_action = 'delete' then null else v_row.moderated_at end
  );
end
$$;

revoke execute on function public.review_reports_autohide() from public, anon, authenticated;
revoke execute on function public.admin_review_queue(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_moderate_review(uuid, text) from public, anon;
grant execute on function public.admin_review_queue(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_moderate_review(uuid, text) to authenticated, service_role;
