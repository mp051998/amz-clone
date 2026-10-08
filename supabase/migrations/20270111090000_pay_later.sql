/*
 * Pay Later, as amazon.in's Amazon Pay Later (a demo: there's no credit check, and nothing is lent
 * or billed for real). A shopper activates it at once in a store that offers it
 * (markets.pay_later_limit_minor: amazon.in) and gets that store's limit. 'paylater' is then one of
 * the store's payment methods:
 *   - an order paid with it is bought on credit, and uses up that much of the limit;
 *   - its refunds (a cancelled order or items, a received return) go back to Pay Later at once, as
 *     every refund to a method other than card does, and free up the limit again, as repayments do;
 *   - what's owed is billed on the 1st of each month, the store's time: what was bought before then, less
 *     its refunds, that repayments haven't covered (they pay off the oldest purchases first). The
 *     bill is due on the 5th; unpaid after that it's overdue, and Pay Later can't be used until it's
 *     paid.
 * A BEFORE INSERT trigger on orders turns down a Pay Later order by a shopper who hasn't activated
 * it (pay_later_inactive), whose bill is overdue (pay_later_overdue) or whose available limit
 * doesn't cover it (pay_later_limit), and names the payment.
 */

alter table public.markets
  add column pay_later_limit_minor integer check (pay_later_limit_minor > 0);
update public.markets
   set pay_later_limit_minor = 6000000, payment_methods = payment_methods || array['paylater']
 where id = 'IN';

alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('card', 'giftcard', 'upi', 'netbanking', 'cod', 'emi', 'amazonpay', 'paylater'));

create table public.pay_later_accounts (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- the store it's for: its orders paid with Pay Later, billed on its time
  market_id    text not null references public.markets (id),
  limit_minor  integer not null check (limit_minor > 0),
  activated_at timestamptz not null default now()
);

create table public.pay_later_repayments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.pay_later_accounts (user_id) on delete cascade,
  amount_minor integer not null check (amount_minor > 0),
  method       text not null check (method in ('upi', 'netbanking')),
  bank         text,
  created_at   timestamptz not null default now()
);

create index pay_later_repayments_user_idx on public.pay_later_repayments (user_id, created_at desc);

alter table public.pay_later_accounts enable row level security;
alter table public.pay_later_repayments enable row level security;

create policy "read own pay later account" on public.pay_later_accounts
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "read own pay later repayments" on public.pay_later_repayments
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.pay_later_accounts, public.pay_later_repayments from anon, authenticated;
revoke all on public.pay_later_accounts, public.pay_later_repayments from anon;

/**
 * A shopper's Pay Later standing (all null without an account): their limit, what they owe (below
 * zero, a credit: refunds of what they'd already repaid), and the latest bill, made on the 1st
 * (the store's time) and due on the 5th, with whether it's overdue.
 */
create function private.pay_later_state(
  p_uid uuid,
  out limit_minor integer,
  out owed_minor bigint,
  out bill_minor bigint,
  out due_on date,
  out overdue boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_market    text;
  v_tz        text;
  v_billed_at timestamptz;
  v_bought    bigint;
  v_before    bigint;
  v_repaid    bigint;
begin
  select a.limit_minor, a.market_id, m.time_zone into limit_minor, v_market, v_tz
    from public.pay_later_accounts a join public.markets m on m.id = a.market_id
   where a.user_id = p_uid;
  if not found then
    return;
  end if;
  v_billed_at := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  -- each order: what it cost when bought (what it comes to now plus the items cancelled since)
  -- less what's been refunded on it
  select coalesce(sum(n.minor), 0), coalesce(sum(n.minor) filter (where n.created_at < v_billed_at), 0)
    into v_bought, v_before
    from (
      select o.created_at,
             o.total_minor + coalesce(c.cancelled, 0) - coalesce(c.refunded, 0) - coalesce(r.refunded, 0)
               - case when o.refund_status = 'succeeded' then coalesce(o.refund_minor, 0) else 0 end as minor
        from public.orders o
        left join lateral (
          select sum(x.refund_minor) as cancelled,
                 sum(x.refund_minor) filter (where x.refund_status = 'succeeded') as refunded
            from public.order_cancellations x
           where x.order_id = o.id
        ) c on true
        left join lateral (
          select sum(rt.refund_minor) as refunded
            from public.returns rt
           where rt.order_id = o.id and rt.refund_status = 'succeeded' and rt.refund_to = 'original'
        ) r on true
       where o.user_id = p_uid and o.market_id = v_market and o.payment_method = 'paylater'
    ) n;
  select coalesce(sum(p.amount_minor), 0) into v_repaid from public.pay_later_repayments p where p.user_id = p_uid;
  owed_minor := v_bought - v_repaid;
  -- repayments pay off the oldest purchases first
  bill_minor := greatest(v_before - v_repaid, 0);
  due_on := case when bill_minor > 0 then (v_billed_at at time zone v_tz)::date + 4 end;
  overdue := coalesce((now() at time zone v_tz)::date > due_on, false);
end
$$;

/** How much of the limit is free: the limit less what's owed (a credit doesn't raise it). */
create function private.pay_later_available(p_limit integer, p_owed bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select greatest(least(p_limit::bigint, p_limit - p_owed), 0)
$$;

/** A shopper's Pay Later account as the API returns it (null without one). */
create function private.pay_later_json(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'activated_at', a.activated_at,
    'market_id', a.market_id,
    'limit_minor', s.limit_minor,
    'used_minor', greatest(s.owed_minor, 0),
    'credit_minor', greatest(-s.owed_minor, 0),
    'available_minor', private.pay_later_available(s.limit_minor, s.owed_minor),
    'bill_minor', s.bill_minor,
    'unbilled_minor', greatest(s.owed_minor, 0) - s.bill_minor,
    'due_on', s.due_on,
    'overdue', s.overdue)
    from public.pay_later_accounts a
    cross join lateral private.pay_later_state(a.user_id) s
   where a.user_id = p_uid
$$;

/** The caller's Pay Later account, or null when they haven't activated it. */
create function public.pay_later()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return private.pay_later_json(auth.uid());
end
$$;

revoke execute on function public.pay_later() from public, anon;
grant execute on function public.pay_later() to authenticated;

/**
 * Activate Pay Later in a store that offers it (pay_later_unavailable where it isn't), with that
 * store's limit. Activating again changes nothing. Returns the account.
 */
create function public.activate_pay_later(p_market text default 'IN')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_limit integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select m.pay_later_limit_minor into v_limit from public.markets m where m.id = p_market;
  if v_limit is null then
    raise exception 'pay_later_unavailable' using errcode = '22023';
  end if;
  insert into public.pay_later_accounts (user_id, market_id, limit_minor) values (v_uid, p_market, v_limit)
  on conflict (user_id) do nothing;
  return private.pay_later_json(v_uid);
end
$$;

revoke execute on function public.activate_pay_later(text) from public, anon;
grant execute on function public.activate_pay_later(text) to authenticated;

/**
 * Repay some or all of what the caller owes, by UPI or net banking (naming the bank). The amount
 * is invalid_input (detail 'amount') unless it's more than nothing and no more than what's owed;
 * the method is (detail 'method') unless it's one of those. Returns the account.
 */
create function public.repay_pay_later(p_amount integer, p_method text, p_bank text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_owed bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform 1 from public.pay_later_accounts a where a.user_id = v_uid for update;
  if not found then
    raise exception 'pay_later_inactive' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('upi', 'netbanking') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'method';
  end if;
  select s.owed_minor into v_owed from private.pay_later_state(v_uid) s;
  if p_amount is null or p_amount <= 0 or p_amount > v_owed then
    raise exception 'invalid_input' using errcode = '22023', detail = 'amount';
  end if;
  insert into public.pay_later_repayments (user_id, amount_minor, method, bank)
  values (v_uid, p_amount, p_method, case when p_method = 'netbanking' then nullif(btrim(coalesce(p_bank, '')), '') end);
  return private.pay_later_json(v_uid);
end
$$;

revoke execute on function public.repay_pay_later(integer, text, text) from public, anon;
grant execute on function public.repay_pay_later(integer, text, text) to authenticated;

/**
 * A Pay Later order: the shopper has activated it, their bill isn't overdue and the available limit
 * covers the order (detail: what's available). The account row is locked so two orders at once
 * can't both spend the same limit.
 */
create function private.orders_pay_later()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s record;
  v_available bigint;
begin
  perform 1 from public.pay_later_accounts a where a.user_id = new.user_id and a.market_id = new.market_id for update;
  if not found then
    raise exception 'pay_later_inactive' using errcode = '22023';
  end if;
  select * into v_s from private.pay_later_state(new.user_id);
  if v_s.overdue then
    raise exception 'pay_later_overdue' using errcode = '22023';
  end if;
  v_available := private.pay_later_available(v_s.limit_minor, v_s.owed_minor);
  if new.total_minor > v_available then
    raise exception 'pay_later_limit' using errcode = '22023', detail = v_available::text;
  end if;
  new.payment_label := 'Pay Later';
  return new;
end
$$;

create trigger orders_pay_later
  before insert on public.orders
  for each row
  when (new.payment_method = 'paylater')
  execute function private.orders_pay_later();

/** A Pay Later order's refunds go back to Pay Later, not to the store balance. */
create function private.returns_pay_later_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.orders o where o.id = new.order_id and o.payment_method = 'paylater') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'refund_to';
  end if;
  return new;
end
$$;

create trigger returns_pay_later_refund
  before insert or update of refund_to on public.returns
  for each row
  when (new.refund_to = 'balance')
  execute function private.returns_pay_later_refund();
