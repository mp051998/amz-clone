/*
 * Customer service cases, as Amazon's "Contact us": a signed-in shopper opens a case in a store
 * (optionally about one of their orders) with a first message, the store's admins reply, and the
 * shopper replies back until either side closes it.
 *
 * A case is `open` while it waits on the store (a new case, or the shopper replied last),
 * `answered` once an admin replied, and `closed` for good: nobody writes to a closed case, and
 * the shopper opens a new one instead. A shopper can have up to 5 cases waiting or answered per
 * store at a time.
 *
 * Shoppers read their own cases and messages; admins read every case. All writes go through the
 * functions below, which set the author, the status and the timestamps.
 */

create table public.support_cases (
  id            uuid primary key default gen_random_uuid(),
  market_id     text not null references public.markets (id),
  user_id       uuid references auth.users (id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 1 and 60),
  order_id      text references public.orders (id) on delete set null,
  topic         text not null check (topic in ('order', 'delivery', 'return', 'payment', 'account', 'other')),
  subject       text not null check (char_length(subject) between 3 and 120),
  status        text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz,
  check ((status = 'closed') = (closed_at is not null))
);

create index support_cases_user_idx on public.support_cases (user_id, market_id, updated_at desc);
create index support_cases_queue_idx on public.support_cases (market_id, status, updated_at);
create index support_cases_order_idx on public.support_cases (order_id);

create table public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.support_cases (id) on delete cascade,
  author     text not null check (author in ('customer', 'agent')),
  user_id    uuid references auth.users (id) on delete set null,
  body       text not null check (char_length(body) between 2 and 2000),
  created_at timestamptz not null default now()
);

create index support_messages_case_idx on public.support_messages (case_id, created_at);
create index support_messages_user_idx on public.support_messages (user_id);

alter table public.support_cases enable row level security;
alter table public.support_messages enable row level security;

create policy "own cases, or any as an admin" on public.support_cases
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "messages on own cases, or any as an admin" on public.support_messages
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.support_cases c where c.id = case_id and c.user_id = (select auth.uid()))
  );

revoke all on public.support_cases from anon;
revoke all on public.support_messages from anon;
revoke insert, update, delete, truncate on public.support_cases from authenticated;
revoke insert, update, delete, truncate on public.support_messages from authenticated;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create function private.support_case_json(c public.support_cases)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'market_id', c.market_id, 'user_id', c.user_id, 'customer_name', c.customer_name,
    'order_id', c.order_id, 'topic', c.topic, 'subject', c.subject, 'status', c.status,
    'created_at', c.created_at, 'updated_at', c.updated_at, 'closed_at', c.closed_at
  )
$$;

create function private.support_message_json(m public.support_messages)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'case_id', m.case_id, 'author', m.author, 'body', m.body, 'created_at', m.created_at)
$$;

-- ---------------------------------------------------------------------------
-- writes
-- ---------------------------------------------------------------------------

/**
 * Open a case in a store with its first message. `p_order`, when given, must be one of the
 * caller's orders in that store.
 */
create function public.open_support_case(
  p_market  text,
  p_topic   text,
  p_subject text,
  p_body    text,
  p_order   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_subject text := btrim(coalesce(p_subject, ''), E' \t\r\n');
  v_body    text := private.qa_text(p_body);
  v_case    public.support_cases;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.markets m where m.id = p_market) then
    raise exception 'unknown_market' using errcode = '22023', detail = coalesce(p_market, '');
  end if;
  if p_topic is null or p_topic not in ('order', 'delivery', 'return', 'payment', 'account', 'other') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'topic';
  end if;
  if char_length(v_subject) not between 3 and 120 or v_subject ~ '[\r\n]' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'subject';
  end if;
  if char_length(v_body) not between 10 and 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'body';
  end if;
  if p_order is not null and not exists (
    select 1 from public.orders o where o.id = p_order and o.user_id = v_uid and o.market_id = p_market
  ) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  -- one at a time per shopper, so the count below can't be raced past
  perform pg_advisory_xact_lock(hashtext('support:' || v_uid::text));
  if (
    select count(*) from public.support_cases c
    where c.user_id = v_uid and c.market_id = p_market and c.status <> 'closed'
  ) >= 5 then
    raise exception 'too_many_cases' using errcode = 'P0001';
  end if;

  insert into public.support_cases (market_id, user_id, customer_name, order_id, topic, subject)
  values (p_market, v_uid, private.qa_author(v_uid), p_order, p_topic, v_subject)
  returning * into v_case;
  insert into public.support_messages (case_id, author, user_id, body)
  values (v_case.id, 'customer', v_uid, v_body);
  return private.support_case_json(v_case);
end
$$;

/**
 * Reply on a case that isn't closed: the shopper on their own case (it waits on the store again),
 * or an admin on any case (it's answered).
 */
create function public.reply_support_case(p_case uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_body   text := private.qa_text(p_body);
  v_case   public.support_cases;
  v_author text;
  v_msg    public.support_messages;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_case from public.support_cases c where c.id = p_case for update;
  if not found then
    raise exception 'case_not_found' using errcode = 'P0002';
  end if;
  if v_case.user_id = v_uid then
    v_author := 'customer';
  elsif public.is_admin() then
    v_author := 'agent';
  else
    raise exception 'case_not_found' using errcode = 'P0002';
  end if;
  if v_case.status = 'closed' then
    raise exception 'case_closed' using errcode = 'P0001';
  end if;
  if char_length(v_body) not between 2 and 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'body';
  end if;

  insert into public.support_messages (case_id, author, user_id, body)
  values (p_case, v_author, v_uid, v_body)
  returning * into v_msg;
  update public.support_cases c
     set status = case when v_author = 'agent' then 'answered' else 'open' end,
         updated_at = v_msg.created_at
   where c.id = p_case;
  return private.support_message_json(v_msg);
end
$$;

/** Close a case (yours, or any as an admin). Closing a closed case changes nothing. */
create function public.close_support_case(p_case uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_case public.support_cases;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_case from public.support_cases c where c.id = p_case for update;
  if not found or (v_case.user_id is distinct from v_uid and not public.is_admin()) then
    raise exception 'case_not_found' using errcode = 'P0002';
  end if;
  if v_case.status <> 'closed' then
    update public.support_cases c
       set status = 'closed', closed_at = now(), updated_at = now()
     where c.id = p_case
    returning * into v_case;
  end if;
  return private.support_case_json(v_case);
end
$$;

revoke execute on function private.support_case_json(public.support_cases) from public, anon, authenticated;
revoke execute on function private.support_message_json(public.support_messages) from public, anon, authenticated;

revoke execute on function public.open_support_case(text, text, text, text, text) from public, anon;
revoke execute on function public.reply_support_case(uuid, text) from public, anon;
revoke execute on function public.close_support_case(uuid) from public, anon;
grant execute on function public.open_support_case(text, text, text, text, text) to authenticated, service_role;
grant execute on function public.reply_support_case(uuid, text) to authenticated, service_role;
grant execute on function public.close_support_case(uuid) to authenticated, service_role;
