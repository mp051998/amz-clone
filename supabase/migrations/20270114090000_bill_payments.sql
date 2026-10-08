/*
 * Bill payments, as amazon.in's Amazon Pay "Pay bills" (a demo: no biller is reached, and
 * nothing is paid or charged for real). The shopper picks a biller — electricity, DTH, broadband,
 * piped gas, water or FASTag — enters their account with it, and pays with the store balance, UPI
 * or net banking.
 *
 * - billers: who can be paid, by store (amazon.in) and category, with what the biller calls the
 *   account and what one looks like. Billers that send a bill (`fetches`) are paid that bill in
 *   full, once a month; the others (DTH, FASTag) take an amount the shopper chooses, within the
 *   biller's limits. Anyone reads them; only the store writes them.
 * - fetch_bill(): this month's bill for an account (made up from the account, the same every
 *   time), due on the 20th (store time), and whether the caller has paid it.
 * - bill_payments: the shopper's payments. Written only by pay_bill(), which checks the biller,
 *   account, amount and method (invalid_input, detail biller | account | amount | method), refuses a
 *   bill already paid (bill_paid) or a fetched bill whose amount has changed (amount_mismatch), and
 *   takes the amount from the balance when that pays (insufficient_balance when it doesn't cover it).
 * - balance_entries.kind gains 'bill'.
 */

create table public.billers (
  id              text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  market_id       text not null references public.markets (id),
  category        text not null check (category in ('electricity', 'dth', 'broadband', 'gas', 'water', 'fastag')),
  name            text not null check (char_length(name) between 1 and 80),
  -- what the biller calls the account ("Consumer number"), and what one looks like
  account_label   text not null check (char_length(account_label) between 1 and 40),
  account_hint    text not null check (char_length(account_hint) between 1 and 60),
  -- an account, upper case without spaces or dashes (private.bill_account), matches this
  account_pattern text not null,
  -- the biller sends a bill, paid in full; otherwise the shopper chooses the amount
  fetches         boolean not null,
  min_minor       integer not null default 10000 check (min_minor > 0),
  max_minor       integer not null default 10000000 check (max_minor >= min_minor),
  active          boolean not null default true
);

alter table public.billers enable row level security;

-- the billers are public, like the store's prices; only the store writes them
create policy "billers: read" on public.billers
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.billers from anon, authenticated;

insert into public.billers (id, market_id, category, name, account_label, account_hint, account_pattern, fetches, min_minor, max_minor) values
  ('bescom', 'IN', 'electricity', 'BESCOM (Bengaluru)', 'Account ID', '10 digits', '^[0-9]{10}$', true, 10000, 10000000),
  ('msedcl', 'IN', 'electricity', 'MSEDCL (Maharashtra)', 'Consumer number', '12 digits', '^[0-9]{12}$', true, 10000, 10000000),
  ('tata-power-mumbai', 'IN', 'electricity', 'Tata Power (Mumbai)', 'Consumer number', '12 digits', '^[0-9]{12}$', true, 10000, 10000000),
  ('adani-electricity-mumbai', 'IN', 'electricity', 'Adani Electricity (Mumbai)', 'Account number', '9 digits', '^[0-9]{9}$', true, 10000, 10000000),
  ('bses-rajdhani', 'IN', 'electricity', 'BSES Rajdhani (Delhi)', 'CA number', '9 digits', '^[0-9]{9}$', true, 10000, 10000000),
  ('tangedco', 'IN', 'electricity', 'TANGEDCO (Tamil Nadu)', 'Service number', '9 to 12 digits', '^[0-9]{9,12}$', true, 10000, 10000000),
  ('cesc', 'IN', 'electricity', 'CESC (Kolkata)', 'Customer ID', '11 digits', '^[0-9]{11}$', true, 10000, 10000000),
  ('tata-play', 'IN', 'dth', 'Tata Play', 'Subscriber ID', '10 digits', '^[0-9]{10}$', false, 10000, 2500000),
  ('airtel-dth', 'IN', 'dth', 'Airtel Digital TV', 'Customer ID', '10 digits', '^[0-9]{10}$', false, 10000, 2500000),
  ('dish-tv', 'IN', 'dth', 'Dish TV', 'Viewing card number', '11 digits', '^[0-9]{11}$', false, 10000, 2500000),
  ('sun-direct', 'IN', 'dth', 'Sun Direct', 'Smart card number', '11 digits', '^[0-9]{11}$', false, 10000, 2500000),
  ('d2h', 'IN', 'dth', 'd2h', 'Subscriber ID', '10 digits', '^[0-9]{10}$', false, 10000, 2500000),
  ('act-fibernet', 'IN', 'broadband', 'ACT Fibernet', 'Account number', '6 to 10 digits', '^[0-9]{6,10}$', true, 10000, 10000000),
  ('airtel-xstream-fiber', 'IN', 'broadband', 'Airtel Xstream Fiber', 'Landline number with STD code', '11 digits, starting 0', '^0[0-9]{10}$', true, 10000, 10000000),
  ('jiofiber', 'IN', 'broadband', 'JioFiber', 'Service ID', '12 digits', '^[0-9]{12}$', true, 10000, 10000000),
  ('bsnl-broadband', 'IN', 'broadband', 'BSNL Landline & Broadband', 'Account number', '10 digits', '^[0-9]{10}$', true, 10000, 10000000),
  ('mahanagar-gas', 'IN', 'gas', 'Mahanagar Gas (Mumbai)', 'CA number', '12 digits', '^[0-9]{12}$', true, 10000, 10000000),
  ('igl', 'IN', 'gas', 'Indraprastha Gas (Delhi NCR)', 'BP number', '10 digits', '^[0-9]{10}$', true, 10000, 10000000),
  ('gujarat-gas', 'IN', 'gas', 'Gujarat Gas', 'Customer ID', '12 digits', '^[0-9]{12}$', true, 10000, 10000000),
  ('delhi-jal-board', 'IN', 'water', 'Delhi Jal Board', 'K number', '10 digits', '^[0-9]{10}$', true, 10000, 10000000),
  ('bwssb', 'IN', 'water', 'BWSSB (Bengaluru)', 'RR number', '6 to 12 letters and digits', '^[A-Z0-9]{6,12}$', true, 10000, 10000000),
  ('hmwssb', 'IN', 'water', 'Hyderabad Metro Water', 'CAN number', '9 digits', '^[0-9]{9}$', true, 10000, 10000000),
  ('icici-fastag', 'IN', 'fastag', 'ICICI Bank FASTag', 'Vehicle number', 'like MH12AB1234', '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$', false, 10000, 10000000),
  ('hdfc-fastag', 'IN', 'fastag', 'HDFC Bank FASTag', 'Vehicle number', 'like MH12AB1234', '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$', false, 10000, 10000000),
  ('sbi-fastag', 'IN', 'fastag', 'SBI FASTag', 'Vehicle number', 'like MH12AB1234', '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$', false, 10000, 10000000),
  ('axis-fastag', 'IN', 'fastag', 'Axis Bank FASTag', 'Vehicle number', 'like MH12AB1234', '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$', false, 10000, 10000000);

create table public.bill_payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  market_id    text not null references public.markets (id),
  biller_id    text not null references public.billers (id),
  category     text not null,
  biller_name  text not null,
  account      text not null check (char_length(account) between 1 and 20),
  -- the month of the bill paid (its 1st), for billers that send one
  period       date,
  amount_minor integer not null check (amount_minor > 0),
  method       text not null check (method in ('amazonpay', 'upi', 'netbanking')),
  bank         text,
  created_at   timestamptz not null default now()
);

create index bill_payments_user_idx on public.bill_payments (user_id, created_at desc);
-- a month's bill is paid once
create unique index bill_payments_once on public.bill_payments (user_id, biller_id, account, period) where period is not null;

alter table public.bill_payments enable row level security;

create policy "read own bill payments" on public.bill_payments
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.bill_payments from anon, authenticated;
revoke all on public.bill_payments from anon;

alter table public.balance_entries drop constraint balance_entries_kind_check;
alter table public.balance_entries
  add constraint balance_entries_kind_check check (kind in ('gift_card', 'order', 'refund', 'reload', 'reward', 'recharge', 'cashback', 'bill'));

/** An account as billers keep it: upper case, without spaces or dashes (mirrored in lib/bills.ts). */
create function private.bill_account(p_account text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_account, ''), '[[:space:]-]', '', 'g'))
$$;

/**
 * A month's bill for an account (a demo: made up from the biller, the account and the month, so
 * the same every time): whole rupees, by the kind of bill.
 */
create function private.bill_amount(p_biller text, p_category text, p_account text, p_period date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_category
           when 'broadband' then (array[49900, 69900, 79900, 99900, 149900])[1 + (x.h % 5)::integer]
           when 'gas' then (250 + (x.h % 1000)::integer) * 100
           when 'water' then (150 + (x.h % 1000)::integer) * 100
           else (300 + (x.h % 4000)::integer) * 100
         end
  from (select abs(hashtext(p_biller || ':' || p_account || ':' || p_period::text)::bigint) as h) x
$$;

/** The month a bill is for in a store, now: its 1st, in store time. */
create function private.bill_period(p_market text)
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone m.time_zone)::date from public.markets m where m.id = p_market
$$;

revoke execute on function private.bill_account(text), private.bill_amount(text, text, text, date), private.bill_period(text)
  from public, anon, authenticated;

/** An active biller, or invalid_input (detail 'biller'). */
create function private.active_biller(p_biller text)
returns public.billers
language plpgsql
stable
set search_path = ''
as $$
declare
  v public.billers;
begin
  select * into v from public.billers b where b.id = p_biller and b.active;
  if not found then
    raise exception 'invalid_input' using errcode = '22023', detail = 'biller';
  end if;
  return v;
end
$$;

revoke execute on function private.active_biller(text) from public, anon, authenticated;

/**
 * This month's bill from a biller that sends one, for an account: { biller_id, account, period,
 * amount_minor, due_on (the 20th), overdue, paid: { id, amount_minor, created_at } | null } — paid
 * when the caller has paid it. invalid_input (detail 'biller' or 'account') for a biller that
 * doesn't send bills or an account that isn't one of its.
 */
create function public.fetch_bill(p_biller text, p_account text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_biller  public.billers := private.active_biller(p_biller);
  v_account text := private.bill_account(p_account);
  v_period  date;
  v_today   date;
begin
  if not v_biller.fetches then
    raise exception 'invalid_input' using errcode = '22023', detail = 'biller';
  end if;
  if v_account !~ v_biller.account_pattern then
    raise exception 'invalid_input' using errcode = '22023', detail = 'account';
  end if;
  v_period := private.bill_period(v_biller.market_id);
  select (now() at time zone m.time_zone)::date into v_today from public.markets m where m.id = v_biller.market_id;
  return jsonb_build_object(
    'biller_id', v_biller.id,
    'account', v_account,
    'period', v_period,
    'amount_minor', private.bill_amount(v_biller.id, v_biller.category, v_account, v_period),
    'due_on', v_period + 19,
    'overdue', v_today > v_period + 19,
    'paid', (
      select jsonb_build_object('id', p.id, 'amount_minor', p.amount_minor, 'created_at', p.created_at)
      from public.bill_payments p
      where p.user_id = auth.uid() and p.biller_id = v_biller.id and p.account = v_account and p.period = v_period)
  );
end
$$;

revoke execute on function public.fetch_bill(text, text) from public;
grant execute on function public.fetch_bill(text, text) to anon, authenticated;

/**
 * Pay a biller for an account, with the store balance ('amazonpay'), UPI or net banking (naming
 * the bank). A biller that sends bills is paid this month's in full: p_amount must be the bill's
 * (amount_mismatch when it has changed), and a bill already paid is bill_paid. Otherwise p_amount
 * is the shopper's, in whole rupees within the biller's limits. Returns the payment.
 */
create function public.pay_bill(p_biller text, p_account text, p_amount integer, p_method text, p_bank text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_biller  public.billers;
  v_account text := private.bill_account(p_account);
  v_period  date;
  v_row     public.bill_payments;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  v_biller := private.active_biller(p_biller);
  if v_account !~ v_biller.account_pattern then
    raise exception 'invalid_input' using errcode = '22023', detail = 'account';
  end if;
  if p_method is null or p_method not in ('amazonpay', 'upi', 'netbanking') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'method';
  end if;
  if v_biller.fetches then
    v_period := private.bill_period(v_biller.market_id);
    if exists (select 1 from public.bill_payments p
                where p.user_id = v_uid and p.biller_id = v_biller.id and p.account = v_account and p.period = v_period) then
      raise exception 'bill_paid' using errcode = 'P0001';
    end if;
    if p_amount is distinct from private.bill_amount(v_biller.id, v_biller.category, v_account, v_period) then
      raise exception 'amount_mismatch' using errcode = 'P0001';
    end if;
  elsif p_amount is null or p_amount % 100 <> 0 or p_amount not between v_biller.min_minor and v_biller.max_minor then
    raise exception 'invalid_input' using errcode = '22023', detail = 'amount';
  end if;
  insert into public.bill_payments (user_id, market_id, biller_id, category, biller_name, account, period, amount_minor, method, bank)
  values (
    v_uid, v_biller.market_id, v_biller.id, v_biller.category, v_biller.name, v_account, v_period, p_amount, p_method,
    case when p_method = 'netbanking' then left(nullif(btrim(coalesce(p_bank, '')), ''), 80) end
  )
  returning * into v_row;
  if p_method = 'amazonpay' then
    perform private.move_balance(v_uid, v_biller.market_id, -p_amount, 'bill');
  end if;
  return to_jsonb(v_row) - 'user_id';
end
$$;

revoke execute on function public.pay_bill(text, text, integer, text, text) from public, anon;
grant execute on function public.pay_bill(text, text, integer, text, text) to authenticated;
