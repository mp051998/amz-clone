/*
 * "Watch this deal", as on Amazon's Today's Deals: a signed-in shopper watches an upcoming
 * Lightning Deal, and when it goes live it's in their messages ("A deal you're watching is live").
 * Only deals that haven't started can be watched; once one is on, there's nothing to wait for.
 * Unwatching works any time. Watches go with the deal or the account.
 */

create table public.lightning_deal_watches (
  user_id    uuid not null references auth.users (id) on delete cascade,
  deal_id    uuid not null references public.lightning_deals (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deal_id)
);

create index lightning_deal_watches_deal on public.lightning_deal_watches (deal_id);

alter table public.lightning_deal_watches enable row level security;

create policy "own deal watches: select" on public.lightning_deal_watches
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.lightning_deal_watches from anon;
revoke insert, update, delete, truncate on public.lightning_deal_watches from authenticated;

/**
 * Watch a deal (`p_watch` true) or stop. Watching needs one that hasn't started or ended
 * (deal_not_upcoming); watching it again, or unwatching one not watched, changes nothing.
 * Returns whether the caller is watching it now.
 */
create function public.watch_lightning_deal(p_deal uuid, p_watch boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.lightning_deals;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not coalesce(p_watch, true) then
    delete from public.lightning_deal_watches w where w.user_id = v_uid and w.deal_id = p_deal;
    return false;
  end if;
  select * into v_deal from public.lightning_deals d where d.id = p_deal;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_deal.started_at is not null or v_deal.ended_at is not null then
    raise exception 'deal_not_upcoming' using errcode = '22023';
  end if;
  insert into public.lightning_deal_watches (user_id, deal_id) values (v_uid, p_deal)
  on conflict do nothing;
  return true;
end
$$;

revoke execute on function public.watch_lightning_deal(uuid, boolean) from public, anon;
grant execute on function public.watch_lightning_deal(uuid, boolean) to authenticated, service_role;
