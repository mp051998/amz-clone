-- Communication preferences, as on Amazon's Communication Preferences Center: a shopper can turn
-- off the messages that aren't about an order they're waiting on: asking them to review what
-- arrived, other shoppers' answers to their questions, and Lightning Deals they watch going live.
-- Order, delivery, refund, return, support, A-to-z claim and recall messages always come.
-- Preferences are the shopper's, across both stores (the account is). Each shopper reads their
-- own; turning a topic on or off goes through set_message_topic.
-- ---------------------------------------------------------------------------

create table public.message_preferences (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- the topics turned off; the rest come
  muted      text[] not null default '{}'
             check (muted <@ array['review_request', 'answer', 'deal_live']::text[]),
  updated_at timestamptz not null default now()
);

alter table public.message_preferences enable row level security;

create policy "read own message preferences" on public.message_preferences
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.message_preferences from anon, authenticated;
revoke all on public.message_preferences from anon;

-- ---------------------------------------------------------------------------
-- set_message_topic: turn a topic on (p_on) or off for the caller. invalid_input (detail
-- 'topic') for anything but review_request, answer or deal_live. Returns the topics now off,
-- in a fixed order.
-- ---------------------------------------------------------------------------
create or replace function public.set_message_topic(p_topic text, p_on boolean)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_muted text[];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_topic is null or p_topic not in ('review_request', 'answer', 'deal_live') or p_on is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'topic';
  end if;
  insert into public.message_preferences as mp (user_id, muted)
  values (v_uid, case when p_on then '{}'::text[] else array[p_topic] end)
  on conflict (user_id) do update
    set muted = array(
          select t from unnest(array['review_request', 'answer', 'deal_live']) with ordinality as a(t, n)
          where (t = any (mp.muted) and t <> p_topic) or (t = p_topic and not p_on)
          order by n
        ),
        updated_at = now()
  returning mp.muted into v_muted;
  return v_muted;
end
$$;

revoke execute on function public.set_message_topic(text, boolean) from public, anon;
grant execute on function public.set_message_topic(text, boolean) to authenticated, service_role;
