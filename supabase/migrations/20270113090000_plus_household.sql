/*
 * Plus Household, as on Amazon Household (a demo: nothing is billed): a Plus member shares their
 * membership's delivery benefits — FREE delivery on every order and FREE faster delivery — with
 * one other adult, at no extra cost.
 *   - The member invites them by email; the invite waits until that adult, signed in with that
 *     email, accepts it (or declines it). Inviting someone else replaces a waiting invite.
 *   - Either of them can end the sharing at any time, and it ends with the membership.
 *   - Someone with their own Plus can't join a household, and joining Plus takes them out of the
 *     one they're in. Delivery Day, the plan and renewal stay the member's own.
 * private.is_plus_member, which every price and order check goes through, counts the adult the
 * membership is shared with. Everything is changed only through the functions below.
 */
create table public.plus_household (
  owner_id   uuid primary key references public.plus_members (user_id) on delete cascade,
  -- who's invited (lower case), kept once they've joined
  email      text not null
    check (email = lower(btrim(email)) and length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- the adult who accepted; null while the invite waits
  member_id  uuid unique references auth.users (id) on delete cascade,
  invited_at timestamptz not null default now(),
  joined_at  timestamptz,
  constraint plus_household_joined_check check ((member_id is null) = (joined_at is null)),
  constraint plus_household_self_check check (member_id is distinct from owner_id)
);

create index plus_household_email on public.plus_household (email) where member_id is null;

alter table public.plus_household enable row level security;

create policy "plus household: read own" on public.plus_household
  for select to authenticated
  using (owner_id = (select auth.uid()) or member_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.plus_household from anon, authenticated;
revoke all on public.plus_household from anon;

/** A member is someone with their own Plus, or the adult a membership is shared with. */
create or replace function private.is_plus_member(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null and (
    exists (select 1 from public.plus_members pm where pm.user_id = p_uid)
    or exists (select 1 from public.plus_household h where h.member_id = p_uid)
  )
$$;

/** Joining Plus takes the new member out of the household they shared. */
create function private.plus_member_leaves_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.plus_household h where h.member_id = new.user_id;
  return new;
end
$$;

create trigger plus_members_leave_household
  after insert on public.plus_members
  for each row execute function private.plus_member_leaves_household();

/** A user's display name (null when they haven't set one). */
create function private.household_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(p.display_name), '') from public.profiles p where p.id = p_uid
$$;

/** The caller's sign-in email, lower case. */
create function private.caller_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid()
$$;

revoke execute on function private.household_name(uuid) from public, anon, authenticated;
revoke execute on function private.caller_email() from public, anon, authenticated;

/**
 * The caller's household: `owned`, the sharing of their own membership (who's invited, and their
 * name once they've joined); `shared`, the membership they share (whose, since when, and its plan
 * and renewal); `invites`, the invites waiting for them. Signed in only.
 */
create function public.plus_household()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'owned', (
      select jsonb_build_object(
        'email', h.email, 'member_name', private.household_name(h.member_id), 'invited_at', h.invited_at, 'joined_at', h.joined_at)
      from public.plus_household h
      where h.owner_id = v_uid),
    'shared', (
      select jsonb_build_object(
        'owner_name', private.household_name(h.owner_id), 'joined_at', h.joined_at, 'market_id', pm.market_id, 'plan', pm.plan,
        'next_plan', pm.next_plan, 'renews_at', pm.renews_at, 'auto_renew', pm.auto_renew)
      from public.plus_household h
      join public.plus_members pm on pm.user_id = h.owner_id
      where h.member_id = v_uid),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('owner_id', h.owner_id, 'owner_name', private.household_name(h.owner_id), 'invited_at', h.invited_at)
                       order by h.invited_at desc)
      from public.plus_household h
      where h.member_id is null and h.email = private.caller_email() and h.owner_id <> v_uid), '[]'::jsonb)
  );
end
$$;

/**
 * Invite an adult, by email, to share the caller's Plus. Members with their own Plus only
 * (plus_required); not the caller's own email, nor one that isn't an email (invalid_input,
 * detail 'email'); not while someone has joined (household_full). Replaces a waiting invite.
 * Returns the household.
 */
create function public.invite_plus_household(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.plus_members pm where pm.user_id = v_uid) then
    raise exception 'plus_required' using errcode = '42501';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or v_email = private.caller_email() then
    raise exception 'invalid_input' using errcode = '22023', detail = 'email';
  end if;
  if exists (select 1 from public.plus_household h where h.owner_id = v_uid and h.member_id is not null) then
    raise exception 'household_full' using errcode = 'P0001';
  end if;
  insert into public.plus_household (owner_id, email)
  values (v_uid, v_email)
  on conflict (owner_id) do update set email = excluded.email, invited_at = now()
  where public.plus_household.member_id is null;
  return public.plus_household();
end
$$;

/**
 * Accept the invite `p_owner` sent to the caller's email, sharing their Plus from now on.
 * invite_not_found when there's no such invite waiting; plus_owned when the caller has their own
 * Plus; household_member when they already share someone's. Returns the household.
 */
create function public.accept_plus_household(p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform 1 from public.plus_household h
   where h.owner_id = p_owner and h.owner_id <> v_uid and h.member_id is null and h.email = private.caller_email()
   for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.plus_members pm where pm.user_id = v_uid) then
    raise exception 'plus_owned' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.plus_household h where h.member_id = v_uid) then
    raise exception 'household_member' using errcode = 'P0001';
  end if;
  update public.plus_household h set member_id = v_uid, joined_at = now() where h.owner_id = p_owner;
  return public.plus_household();
end
$$;

/** Decline the invite `p_owner` sent to the caller's email (a no-op when there's none). Returns the household. */
create function public.decline_plus_household(p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.plus_household h
   where h.owner_id = p_owner and h.member_id is null and h.email = private.caller_email();
  return public.plus_household();
end
$$;

/**
 * End the caller's household: the member cancels their invite or stops sharing with the adult
 * who joined, and that adult leaves the membership they share. Returns the household.
 */
create function public.end_plus_household()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.plus_household h where h.owner_id = v_uid or h.member_id = v_uid;
  return public.plus_household();
end
$$;

revoke execute on function public.plus_household() from public, anon;
revoke execute on function public.invite_plus_household(text) from public, anon;
revoke execute on function public.accept_plus_household(uuid) from public, anon;
revoke execute on function public.decline_plus_household(uuid) from public, anon;
revoke execute on function public.end_plus_household() from public, anon;
grant execute on function public.plus_household() to authenticated;
grant execute on function public.invite_plus_household(text) to authenticated;
grant execute on function public.accept_plus_household(uuid) to authenticated;
grant execute on function public.decline_plus_household(uuid) to authenticated;
grant execute on function public.end_plus_household() to authenticated;
