/*
 * Mobile recharge, as amazon.in's Amazon Pay recharges (a demo: no operator is reached, and
 * nothing is recharged or charged for real). The shopper enters a prepaid number, its operator and
 * circle, picks one of the operator's plans and pays with the store balance, UPI or net banking.
 *
 * - recharge_plans: each operator's plans, by store (amazon.in), with what they give. Anyone reads
 *   them; only the store writes them.
 * - recharges: the shopper's recharges. Written only by recharge_mobile(), which checks the number
 *   (ten digits, starting 6–9), the circle and the method (invalid_input, detail number | circle |
 *   plan | method), takes the plan's price from the balance when that pays (insufficient_balance
 *   when it doesn't cover it) and pays the cashback into the balance at once: 2% of the plan,
 *   rounded down to the rupee, up to ₹25 (private.recharge_cashback, mirrored in lib/recharge.ts).
 * - balance_entries.kind gains 'recharge' (paid from the balance) and 'cashback'.
 */

create table public.recharge_plans (
  id            text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  market_id     text not null references public.markets (id),
  operator      text not null check (char_length(operator) between 1 and 40),
  amount_minor  integer not null check (amount_minor > 0),
  -- null: a data pack, good for as long as the plan it's added to
  validity_days integer check (validity_days > 0),
  data          text not null check (char_length(data) between 1 and 40),
  calls         text check (char_length(calls) between 1 and 40),
  sms           text check (char_length(sms) between 1 and 40),
  kind          text not null check (kind in ('unlimited', 'data')),
  active        boolean not null default true,
  unique (market_id, operator, amount_minor)
);

alter table public.recharge_plans enable row level security;

-- the plans are public, like the store's prices; only the store writes them
create policy "recharge plans: read" on public.recharge_plans
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.recharge_plans from anon, authenticated;

insert into public.recharge_plans (id, market_id, operator, amount_minor, validity_days, data, calls, sms, kind) values
  ('jio-249',     'IN', 'Jio',    24900,  28,   '1 GB/day',   'Unlimited', '100/day', 'unlimited'),
  ('jio-299',     'IN', 'Jio',    29900,  28,   '1.5 GB/day', 'Unlimited', '100/day', 'unlimited'),
  ('jio-349',     'IN', 'Jio',    34900,  28,   '2 GB/day',   'Unlimited', '100/day', 'unlimited'),
  ('jio-799',     'IN', 'Jio',    79900,  84,   '1.5 GB/day', 'Unlimited', '100/day', 'unlimited'),
  ('jio-3599',    'IN', 'Jio',    359900, 365,  '2.5 GB/day', 'Unlimited', '100/day', 'unlimited'),
  ('jio-19',      'IN', 'Jio',    1900,   null, '1 GB',       null,        null,      'data'),
  ('jio-69',      'IN', 'Jio',    6900,   null, '6 GB',       null,        null,      'data'),
  ('airtel-199',  'IN', 'Airtel', 19900,  28,   '2 GB',       'Unlimited', '300',     'unlimited'),
  ('airtel-299',  'IN', 'Airtel', 29900,  28,   '1 GB/day',   'Unlimited', '100/day', 'unlimited'),
  ('airtel-379',  'IN', 'Airtel', 37900,  30,   '2 GB/day',   'Unlimited', '100/day', 'unlimited'),
  ('airtel-859',  'IN', 'Airtel', 85900,  84,   '1.5 GB/day', 'Unlimited', '100/day', 'unlimited'),
  ('airtel-3599', 'IN', 'Airtel', 359900, 365,  '2 GB/day',   'Unlimited', '100/day', 'unlimited'),
  ('airtel-22',   'IN', 'Airtel', 2200,   null, '1 GB',       null,        null,      'data'),
  ('airtel-77',   'IN', 'Airtel', 7700,   null, '5 GB',       null,        null,      'data'),
  ('vi-199',      'IN', 'Vi',     19900,  28,   '2 GB',       'Unlimited', '300',     'unlimited'),
  ('vi-299',      'IN', 'Vi',     29900,  28,   '1 GB/day',   'Unlimited', '100/day', 'unlimited'),
  ('vi-365',      'IN', 'Vi',     36500,  28,   '2 GB/day',   'Unlimited', '100/day', 'unlimited'),
  ('vi-859',      'IN', 'Vi',     85900,  84,   '1.5 GB/day', 'Unlimited', '100/day', 'unlimited'),
  ('vi-3499',     'IN', 'Vi',     349900, 365,  '1.5 GB/day', 'Unlimited', '100/day', 'unlimited'),
  ('vi-24',       'IN', 'Vi',     2400,   null, '1 GB',       null,        null,      'data'),
  ('bsnl-107',    'IN', 'BSNL',   10700,  35,   '3 GB',       '200 min',   null,      'unlimited'),
  ('bsnl-197',    'IN', 'BSNL',   19700,  70,   '2 GB/day',   'Unlimited', '100/day', 'unlimited'),
  ('bsnl-397',    'IN', 'BSNL',   39700,  150,  '2 GB/day',   'Unlimited', '100/day', 'unlimited'),
  ('bsnl-1999',   'IN', 'BSNL',   199900, 365,  '600 GB',     'Unlimited', '100/day', 'unlimited'),
  ('bsnl-58',     'IN', 'BSNL',   5800,   null, '2 GB/day',   null,        null,      'data');

create table public.recharges (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  market_id      text not null references public.markets (id),
  number         text not null check (number ~ '^[6-9][0-9]{9}$'),
  operator       text not null,
  circle         text not null,
  plan_id        text not null references public.recharge_plans (id),
  amount_minor   integer not null check (amount_minor > 0),
  cashback_minor integer not null default 0 check (cashback_minor >= 0),
  method         text not null check (method in ('amazonpay', 'upi', 'netbanking')),
  bank           text,
  created_at     timestamptz not null default now()
);

create index recharges_user_idx on public.recharges (user_id, created_at desc);

alter table public.recharges enable row level security;

create policy "read own recharges" on public.recharges
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.recharges from anon, authenticated;
revoke all on public.recharges from anon;

alter table public.balance_entries drop constraint balance_entries_kind_check;
alter table public.balance_entries
  add constraint balance_entries_kind_check check (kind in ('gift_card', 'order', 'refund', 'reload', 'reward', 'recharge', 'cashback'));

/** The telecom circles a number can be in (mirrored in lib/recharge.ts). */
create function private.recharge_circles()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'Andhra Pradesh & Telangana', 'Assam', 'Bihar & Jharkhand', 'Chennai', 'Delhi NCR', 'Gujarat',
    'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Karnataka', 'Kerala', 'Kolkata',
    'Madhya Pradesh & Chhattisgarh', 'Maharashtra & Goa', 'Mumbai', 'North East', 'Odisha',
    'Punjab', 'Rajasthan', 'Tamil Nadu', 'UP East', 'UP West & Uttarakhand', 'West Bengal'
  ]
$$;

/** A recharge's cashback: 2% of the plan, rounded down to the rupee, up to ₹25 (mirrored in lib/recharge.ts). */
create function private.recharge_cashback(p_amount integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(p_amount * 2 / 100 / 100 * 100, 2500)
$$;

revoke execute on function private.recharge_circles(), private.recharge_cashback(integer) from public, anon, authenticated;

/**
 * Recharge a prepaid number with a plan, paying with the store balance ('amazonpay'), UPI or net
 * banking (naming the bank); the cashback goes into the balance at once. Returns the recharge.
 */
create function public.recharge_mobile(p_number text, p_circle text, p_plan text, p_method text, p_bank text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan public.recharge_plans;
  v_row  public.recharges;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_number is null or p_number !~ '^[6-9][0-9]{9}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'number';
  end if;
  if p_circle is null or not (p_circle = any (private.recharge_circles())) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'circle';
  end if;
  select * into v_plan from public.recharge_plans p where p.id = p_plan and p.active;
  if not found then
    raise exception 'invalid_input' using errcode = '22023', detail = 'plan';
  end if;
  if p_method is null or p_method not in ('amazonpay', 'upi', 'netbanking') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'method';
  end if;
  insert into public.recharges (user_id, market_id, number, operator, circle, plan_id, amount_minor, cashback_minor, method, bank)
  values (
    v_uid, v_plan.market_id, p_number, v_plan.operator, p_circle, v_plan.id, v_plan.amount_minor,
    private.recharge_cashback(v_plan.amount_minor), p_method,
    case when p_method = 'netbanking' then left(nullif(btrim(coalesce(p_bank, '')), ''), 80) end
  )
  returning * into v_row;
  if p_method = 'amazonpay' then
    perform private.move_balance(v_uid, v_plan.market_id, -v_plan.amount_minor, 'recharge');
  end if;
  if v_row.cashback_minor > 0 then
    perform private.move_balance(v_uid, v_plan.market_id, v_row.cashback_minor, 'cashback');
  end if;
  return to_jsonb(v_row) - 'user_id';
end
$$;

revoke execute on function public.recharge_mobile(text, text, text, text, text) from public, anon;
grant execute on function public.recharge_mobile(text, text, text, text, text) to authenticated;
