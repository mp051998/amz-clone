-- "Your messages" marks what's new: updates since the shopper last opened the page in that store.
-- The feed itself is built from orders, returns, support and Q&A; this only remembers when each
-- shopper last looked, per store.

create table public.inbox_reads (
  user_id   uuid not null references auth.users (id) on delete cascade,
  market_id text not null references public.markets (id) on delete cascade,
  seen_at   timestamptz not null default now(),
  primary key (user_id, market_id)
);

alter table public.inbox_reads enable row level security;

create policy "own inbox reads: select" on public.inbox_reads
  for select to authenticated using (user_id = (select auth.uid()));

-- The caller opened their messages in a store; returns when.
create function public.mark_inbox_seen(p_market text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz := now();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.markets m where m.id = p_market) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'market';
  end if;
  insert into public.inbox_reads (user_id, market_id, seen_at) values (v_uid, p_market, v_at)
  on conflict (user_id, market_id) do update set seen_at = greatest(public.inbox_reads.seen_at, excluded.seen_at);
  return v_at;
end $$;

revoke all on public.inbox_reads from anon;
revoke insert, update, delete, truncate on public.inbox_reads from authenticated;
revoke execute on function public.mark_inbox_seen(text) from public, anon;
grant execute on function public.mark_inbox_seen(text) to authenticated, service_role;
