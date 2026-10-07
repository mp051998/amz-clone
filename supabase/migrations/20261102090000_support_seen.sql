-- New replies on support cases: a case has one for its shopper while the store has written since
-- the shopper last looked at it. Opening the case marks it seen (mark_support_case_seen), and so
-- does writing on it (opening or replying), which the trigger below records.

alter table public.support_cases add column customer_seen_at timestamptz;

-- cases from before this: the shopper has seen what they had written themselves
update public.support_cases c
   set customer_seen_at = (select max(m.created_at) from public.support_messages m where m.case_id = c.id and m.author = 'customer');

create function private.support_customer_seen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_cases c
     set customer_seen_at = greatest(coalesce(c.customer_seen_at, new.created_at), new.created_at)
   where c.id = new.case_id;
  return null;
end $$;

create trigger support_messages_customer_seen
  after insert on public.support_messages
  for each row when (new.author = 'customer')
  execute function private.support_customer_seen();

-- The caller's cases in a store with a store reply they haven't seen yet.
create function public.my_unread_support_cases(p_market text)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id
  from public.support_cases c
  where c.user_id = (select auth.uid())
    and c.market_id = p_market
    and exists (
      select 1 from public.support_messages m
      where m.case_id = c.id and m.author = 'agent' and m.created_at > coalesce(c.customer_seen_at, '-infinity'::timestamptz)
    )
  order by c.updated_at desc
$$;

-- The shopper has read their case (a no-op for anyone else's).
create function public.mark_support_case_seen(p_case uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update public.support_cases c set customer_seen_at = now() where c.id = p_case and c.user_id = auth.uid();
end $$;

revoke execute on function private.support_customer_seen() from public, anon, authenticated;
revoke execute on function public.my_unread_support_cases(text) from public, anon;
grant execute on function public.my_unread_support_cases(text) to authenticated, service_role;
revoke execute on function public.mark_support_case_seen(uuid) from public, anon;
grant execute on function public.mark_support_case_seen(uuid) to authenticated, service_role;
