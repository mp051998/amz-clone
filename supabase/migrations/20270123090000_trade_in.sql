/*
 * Trade-In, as on amazon.com (a demo: nothing is shipped, and the credit is store balance): the
 * shopper picks an old phone or laptop from the store's list, says what state it's in and gets a
 * quote. They send it within 7 days with the prepaid label (its code), and when it arrives the
 * store checks it and pays the quote into their balance as gift card credit. One that arrives in
 * worse shape than they said is paid what it's worth as it came; one that isn't the device, or
 * doesn't switch on, is sent back with a note.
 *
 * - exchange_devices gains amazon.com's models. amazon.in takes old devices only in exchange on a
 *   new one (Exchange offers), so Trade-In is amazon.com's: request_trade_in() takes US models.
 * - trade_ins: the shopper's trade-ins, the device as quoted (its name and what it was worth with
 *   an undamaged screen), the condition they gave and the quote. The shopper reads theirs; only
 *   the functions below write them.
 * - request_trade_in(device, condition): invalid_input (detail device | condition), trade_in_limit
 *   with 5 already open.
 * - cancel_trade_in(id): while it's open (trade_in_closed), the caller's own (trade_in_not_found).
 * - Admins: admin_list_trade_ins(market, filter), admin_receive_trade_in(id, market, condition) —
 *   pays the value for the condition it came in, never more than the quote — and
 *   admin_reject_trade_in(id, market, note).
 * - balance_entries.kind gains 'trade_in'.
 */

insert into public.exchange_devices (id, market_id, kind, brand, model, value_minor) values
  ('us-apple-iphone-15-pro',        'US', 'phone',  'Apple',     'iPhone 15 Pro',                     42000),
  ('us-apple-iphone-15',            'US', 'phone',  'Apple',     'iPhone 15',                         33000),
  ('us-apple-iphone-14',            'US', 'phone',  'Apple',     'iPhone 14',                         25000),
  ('us-apple-iphone-13',            'US', 'phone',  'Apple',     'iPhone 13',                         19000),
  ('us-apple-iphone-12',            'US', 'phone',  'Apple',     'iPhone 12',                         12500),
  ('us-apple-iphone-se-3',          'US', 'phone',  'Apple',     'iPhone SE (3rd generation)',         8000),
  ('us-samsung-galaxy-s24',         'US', 'phone',  'Samsung',   'Galaxy S24',                        30000),
  ('us-samsung-galaxy-s23',         'US', 'phone',  'Samsung',   'Galaxy S23',                        21000),
  ('us-samsung-galaxy-a54',         'US', 'phone',  'Samsung',   'Galaxy A54 5G',                      9000),
  ('us-google-pixel-8',             'US', 'phone',  'Google',    'Pixel 8',                           20000),
  ('us-google-pixel-7a',            'US', 'phone',  'Google',    'Pixel 7a',                          10500),
  ('us-motorola-edge-2023',         'US', 'phone',  'Motorola',  'edge (2023)',                        7000),
  ('us-apple-macbook-pro-14-m1',    'US', 'laptop', 'Apple',     'MacBook Pro 14" (M1 Pro, 2021)',    70000),
  ('us-apple-macbook-air-m2',       'US', 'laptop', 'Apple',     'MacBook Air (M2, 2022)',            52000),
  ('us-apple-macbook-air-m1',       'US', 'laptop', 'Apple',     'MacBook Air (M1, 2020)',            36000),
  ('us-microsoft-surface-laptop-5', 'US', 'laptop', 'Microsoft', 'Surface Laptop 5',                  30000),
  ('us-dell-xps-13',                'US', 'laptop', 'Dell',      'XPS 13 (9315)',                     28000),
  ('us-asus-zenbook-14',            'US', 'laptop', 'ASUS',      'Zenbook 14 OLED',                   22000),
  ('us-lenovo-thinkpad-e14',        'US', 'laptop', 'Lenovo',    'ThinkPad E14',                      17000),
  ('us-hp-pavilion-15',             'US', 'laptop', 'HP',        'Pavilion 15',                       15000);

create table public.trade_ins (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  market_id          text not null references public.markets (id),
  device_id          text references public.exchange_devices (id) on delete set null,
  -- the device as quoted: its name, and what it was worth working with an undamaged screen
  device_name        text not null,
  kind               text not null check (kind in ('phone', 'laptop')),
  good_minor         integer not null check (good_minor > 0),
  -- what the shopper said, and what that's worth
  condition          text not null check (condition in ('good', 'screen_damaged')),
  quote_minor        integer not null check (quote_minor > 0),
  status             text not null default 'open' check (status in ('open', 'credited', 'cancelled', 'rejected')),
  -- the prepaid label's code, and the day to send it by
  ship_code          text not null,
  ship_by            timestamptz not null,
  -- the store's check when it arrives, and what it paid
  received_condition text check (received_condition in ('good', 'screen_damaged')),
  credited_minor     integer check (credited_minor > 0),
  reject_note        text check (char_length(reject_note) <= 500),
  created_at         timestamptz not null default now(),
  -- credited, cancelled or rejected
  closed_at          timestamptz,
  check ((status = 'open') = (closed_at is null)),
  check ((status = 'credited') = (credited_minor is not null and received_condition is not null))
);

create index trade_ins_user_idx on public.trade_ins (user_id, created_at desc);
create index trade_ins_market_idx on public.trade_ins (market_id, status, created_at);

alter table public.trade_ins enable row level security;

create policy "read own trade-ins" on public.trade_ins
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.trade_ins from anon, authenticated;
revoke all on public.trade_ins from anon;

alter table public.balance_entries drop constraint balance_entries_kind_check;
alter table public.balance_entries
  add constraint balance_entries_kind_check check (kind in ('gift_card', 'order', 'refund', 'reload', 'reward', 'recharge', 'cashback', 'bill', 'trade_in'));

/** What a device worth p_good with an undamaged screen is worth in a condition: half with a damaged screen (mirrored in lib/trade-in.ts). */
create function private.trade_in_value(p_good integer, p_condition text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_condition when 'good' then p_good else p_good / 2 end
$$;

revoke execute on function private.trade_in_value(integer, text) from public, anon, authenticated;

/**
 * Trade in one of amazon.com's models in a condition: an open trade-in with its quote, a label
 * code and 7 days to send it. Returns the trade-in.
 */
create function public.request_trade_in(p_device text, p_condition text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_dev  public.exchange_devices;
  v_code text := upper(md5(gen_random_uuid()::text));
  v_row  public.trade_ins;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_dev from public.exchange_devices d where d.id = p_device and d.market_id = 'US' and d.active;
  if not found then
    raise exception 'invalid_input' using errcode = '22023', detail = 'device';
  end if;
  if coalesce(p_condition, '') not in ('good', 'screen_damaged') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'condition';
  end if;
  -- one request at a time per shopper, so the limit holds
  perform pg_advisory_xact_lock(hashtextextended('trade_in:' || v_uid::text, 0));
  if (select count(*) from public.trade_ins t where t.user_id = v_uid and t.status = 'open') >= 5 then
    raise exception 'trade_in_limit' using errcode = 'P0001';
  end if;
  insert into public.trade_ins (user_id, market_id, device_id, device_name, kind, good_minor, condition, quote_minor, ship_code, ship_by)
  values (
    v_uid, v_dev.market_id, v_dev.id, v_dev.brand || ' ' || v_dev.model, v_dev.kind, v_dev.value_minor,
    p_condition, private.trade_in_value(v_dev.value_minor, p_condition),
    substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), now() + interval '7 days'
  )
  returning * into v_row;
  return to_jsonb(v_row) - 'user_id';
end
$$;

/** Cancel one of the caller's open trade-ins (nothing has been sent). Returns it. */
create function public.cancel_trade_in(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.trade_ins;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.trade_ins t set status = 'cancelled', closed_at = now()
   where t.id = p_id and t.user_id = v_uid and t.status = 'open'
  returning * into v_row;
  if not found then
    if exists (select 1 from public.trade_ins t where t.id = p_id and t.user_id = v_uid) then
      raise exception 'trade_in_closed' using errcode = 'P0001';
    end if;
    raise exception 'trade_in_not_found' using errcode = 'P0002';
  end if;
  return to_jsonb(v_row) - 'user_id';
end
$$;

-- ---------------------------------------------------------------------------
-- Store admins
-- ---------------------------------------------------------------------------

/** A trade-in as the admin page sees it: with its customer. */
create function private.admin_trade_in_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (to_jsonb(t) - 'user_id') || jsonb_build_object(
    'customer', jsonb_build_object('id', t.user_id, 'email', u.email, 'name', pr.display_name)
  )
  from public.trade_ins t
  left join auth.users u on u.id = t.user_id
  left join public.profiles pr on pr.id = t.user_id
  where t.id = p_id
$$;

revoke execute on function private.admin_trade_in_json(uuid) from public, anon, authenticated;

/**
 * One store's trade-ins: { counts: { open, closed, all }, trade_ins }, filter open (waiting to
 * arrive, oldest first) | closed (credited, cancelled or rejected, newest first) | all (newest
 * first); the latest 200.
 */
create function public.admin_list_trade_ins(p_market text, p_filter text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if coalesce(p_filter, '') not in ('open', 'closed', 'all') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'filter';
  end if;
  return jsonb_build_object(
    'counts', (
      select jsonb_build_object(
        'open', count(*) filter (where t.status = 'open'),
        'closed', count(*) filter (where t.status <> 'open'),
        'all', count(*))
      from public.trade_ins t where t.market_id = p_market),
    'trade_ins', coalesce((
      select jsonb_agg(private.admin_trade_in_json(x.id) order by x.n)
      from (
        select t.id, row_number() over (
          order by case when p_filter = 'open' then t.created_at end asc, t.created_at desc) as n
        from public.trade_ins t
        where t.market_id = p_market
          and (p_filter = 'all' or (p_filter = 'open') = (t.status = 'open'))
        order by n
        limit 200
      ) x), '[]'::jsonb)
  );
end
$$;

/**
 * A store's trade-in arrived, in p_condition: pays what it's worth in that condition, never more
 * than the quote, into the shopper's balance. trade_in_not_found in another store, trade_in_closed
 * unless it's open. Returns it.
 */
create function public.admin_receive_trade_in(p_id uuid, p_market text, p_condition text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.trade_ins;
begin
  perform private.require_admin();
  if coalesce(p_condition, '') not in ('good', 'screen_damaged') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'condition';
  end if;
  select * into v_row from public.trade_ins t where t.id = p_id and t.market_id = p_market for update;
  if not found then
    raise exception 'trade_in_not_found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'open' then
    raise exception 'trade_in_closed' using errcode = 'P0001';
  end if;
  update public.trade_ins t
     set status = 'credited', received_condition = p_condition, closed_at = now(),
         credited_minor = least(v_row.quote_minor, private.trade_in_value(v_row.good_minor, p_condition))
   where t.id = p_id
  returning * into v_row;
  perform private.move_balance(v_row.user_id, v_row.market_id, v_row.credited_minor, 'trade_in');
  return private.admin_trade_in_json(p_id);
end
$$;

/**
 * A store's trade-in that isn't the device, or doesn't switch on: sent back, with a note to the
 * shopper. trade_in_not_found in another store, trade_in_closed unless it's open. Returns it.
 */
create function public.admin_reject_trade_in(p_id uuid, p_market text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform private.require_admin();
  select t.status into v_status from public.trade_ins t where t.id = p_id and t.market_id = p_market for update;
  if not found then
    raise exception 'trade_in_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'open' then
    raise exception 'trade_in_closed' using errcode = 'P0001';
  end if;
  update public.trade_ins t
     set status = 'rejected', closed_at = now(), reject_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500)
   where t.id = p_id;
  return private.admin_trade_in_json(p_id);
end
$$;

revoke execute on function public.request_trade_in(text, text) from public, anon;
revoke execute on function public.cancel_trade_in(uuid) from public, anon;
revoke execute on function public.admin_list_trade_ins(text, text) from public, anon;
revoke execute on function public.admin_receive_trade_in(uuid, text, text) from public, anon;
revoke execute on function public.admin_reject_trade_in(uuid, text, text) from public, anon;
grant execute on function public.request_trade_in(text, text) to authenticated, service_role;
grant execute on function public.cancel_trade_in(uuid) to authenticated, service_role;
grant execute on function public.admin_list_trade_ins(text, text) to authenticated, service_role;
grant execute on function public.admin_receive_trade_in(uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_reject_trade_in(uuid, text, text) to authenticated, service_role;
