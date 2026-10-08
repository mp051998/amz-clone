-- Vine reviews: "Vine Customer Review of Free Product". A Vine reviewer got the item free to give
-- an honest opinion, so a Vine review is never a "Verified Purchase" and stays out of the verified
-- filter. Shoppers can't mark their own review Vine (or unmark it); only trusted writes (seed,
-- service role) set it.
--
-- - reviews.vine
-- - reviews_vine_guard: keeps customer writes off the flag and a Vine review unverified. Before
--   triggers run by name, so this one runs after reviews_before_write has decided "verified".
-- - private.is_vine_sample(): a made-up but stable few of the seeded sample reviews, for
--   demonstration; seed.sql marks the same ones on a fresh database.

alter table public.reviews
  add column vine boolean not null default false;

create function public.reviews_vine_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.review_moderation', true), '') <> 'on' then
    new.vine := case when tg_op = 'INSERT' then false else old.vine end;
  end if;
  if new.vine then
    new.verified := false;
  end if;
  return new;
end
$$;

create trigger reviews_vine_guard
  before insert or update on public.reviews
  for each row execute function public.reviews_vine_guard();

revoke execute on function public.reviews_vine_guard() from public, anon, authenticated;

/** About one seeded review in 25, picked by product and author so it's the same everywhere. */
create function private.is_vine_sample(p_product text, p_author text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select left(md5(p_product || '#vine#' || p_author), 2) < '0a'
$$;

revoke execute on function private.is_vine_sample(text, text) from public, anon, authenticated;

update public.reviews set vine = true where seeded and private.is_vine_sample(product_id, author_name);
