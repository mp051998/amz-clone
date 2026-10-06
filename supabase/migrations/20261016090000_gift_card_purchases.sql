/*
 * Buying gift cards. A signed-in shopper picks an amount (and, optionally, who
 * it's for and a message) and pays by card on Stripe hosted Checkout. Once
 * Stripe reports the session paid, the purchase is confirmed with a service-role
 * call that checks the amount and currency and issues a new gift card code,
 * which the buyer can give away or redeem themselves.
 *
 * Gift cards are bought by card only (never with the store balance), in whole
 * currency units within each store's limits: $1–$2,000 in the US and
 * ₹10–₹10,000 in India.
 */

alter table public.gift_cards add column purchased_by uuid references auth.users (id) on delete set null;

create table public.gift_card_purchases (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  market_id         text not null references public.markets (id),
  amount_minor      integer not null check (amount_minor > 0),
  currency          text not null,
  recipient_name    text check (char_length(recipient_name) between 1 and 60),
  message           text check (char_length(message) between 1 and 240),
  status            text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid')),
  stripe_session_id text unique,
  payment_intent_id text,
  gift_card_code    text unique references public.gift_cards (code) on delete set null,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  constraint gift_card_purchases_paid_check check (status <> 'paid' or paid_at is not null)
);

create index gift_card_purchases_user_idx on public.gift_card_purchases (user_id, market_id, created_at desc);

alter table public.gift_card_purchases enable row level security;

create policy "read own gift card purchases" on public.gift_card_purchases
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.gift_card_purchases from anon, authenticated;
revoke all on public.gift_card_purchases from anon;

/** The smallest and largest gift card a store sells, in minor units. */
create function private.gift_card_limits(p_market text, out min_minor integer, out max_minor integer)
language sql
immutable
set search_path = ''
as $$
  select case p_market when 'IN' then 1000 else 100 end,
         case p_market when 'IN' then 1000000 else 200000 end
$$;

create function private.gift_card_purchase_json(p public.gift_card_purchases)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'market_id', p.market_id, 'amount_minor', p.amount_minor, 'currency', p.currency,
    'recipient_name', p.recipient_name, 'message', p.message, 'status', p.status,
    'code', p.gift_card_code, 'created_at', p.created_at, 'paid_at', p.paid_at,
    'redeemed', coalesce((select g.redeemed_at is not null from public.gift_cards g where g.code = p.gift_card_code), false)
  )
$$;

/**
 * Start buying a gift card: records the purchase as awaiting payment and
 * returns it. The server then opens a Stripe Checkout Session for it.
 */
create function public.start_gift_card_purchase(p_market text, p_amount_minor integer, p_recipient text default null, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_currency  text;
  v_min       integer;
  v_max       integer;
  v_recipient text := nullif(btrim(coalesce(p_recipient, '')), '');
  v_message   text := nullif(btrim(coalesce(p_message, '')), '');
  v_p         public.gift_card_purchases;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select m.currency into v_currency from public.markets m where m.id = p_market;
  if v_currency is null then
    raise exception 'unknown_market' using errcode = '22023';
  end if;
  select l.min_minor, l.max_minor into v_min, v_max from private.gift_card_limits(p_market) l;
  if p_amount_minor is null or p_amount_minor not between v_min and v_max or p_amount_minor % 100 <> 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'amount';
  end if;
  if char_length(v_recipient) > 60 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'recipient';
  end if;
  if char_length(v_message) > 240 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'message';
  end if;

  insert into public.gift_card_purchases (user_id, market_id, amount_minor, currency, recipient_name, message)
  values (v_uid, p_market, p_amount_minor, v_currency, v_recipient, v_message)
  returning * into v_p;
  return private.gift_card_purchase_json(v_p);
end
$$;

/** Link the Stripe Checkout Session to its purchase (service role). */
create function public.attach_gift_card_session(p_purchase uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.gift_card_purchases p
     set stripe_session_id = p_session_id
   where p.id = p_purchase and p.status = 'awaiting_payment';
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;
end
$$;

/**
 * Stripe reported the session paid (service role): check the amount and
 * currency, issue the gift card and mark the purchase paid. Idempotent — the
 * success page and the webhook may both get here.
 */
create function public.confirm_gift_card_purchase(p_session_id text, p_amount_minor integer, p_currency text, p_payment_intent text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p    public.gift_card_purchases;
  v_code text;
begin
  select * into v_p from public.gift_card_purchases p where p.stripe_session_id = p_session_id for update;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;
  if v_p.status = 'paid' then
    return private.gift_card_purchase_json(v_p);
  end if;
  if p_amount_minor is distinct from v_p.amount_minor or lower(coalesce(p_currency, '')) <> lower(v_p.currency) then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  loop
    v_code := private.new_gift_code();
    begin
      insert into public.gift_cards (code, market_id, amount_minor, purchased_by)
      values (v_code, v_p.market_id, v_p.amount_minor, v_p.user_id);
      exit;
    exception when unique_violation then
      -- a code collision: draw another
    end;
  end loop;

  update public.gift_card_purchases p
     set status = 'paid', gift_card_code = v_code, paid_at = now(), payment_intent_id = coalesce(p_payment_intent, p.payment_intent_id)
   where p.id = v_p.id
  returning * into v_p;
  return private.gift_card_purchase_json(v_p);
end
$$;

/** The caller's paid gift card purchases in a store, newest first, with each code and whether it's been redeemed. */
create function public.my_gift_card_purchases(p_market text, p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.gift_card_purchase_json(p) order by p.paid_at desc, p.id), '[]'::jsonb)
  from public.gift_card_purchases p
  where p.id in (
    select x.id from public.gift_card_purchases x
    where x.user_id = (select auth.uid()) and x.market_id = p_market and x.status = 'paid'
    order by x.paid_at desc, x.id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  )
$$;

revoke execute on function private.gift_card_limits(text) from public, anon, authenticated;
revoke execute on function private.gift_card_purchase_json(public.gift_card_purchases) from public, anon, authenticated;

revoke execute on function public.start_gift_card_purchase(text, integer, text, text) from public, anon;
grant execute on function public.start_gift_card_purchase(text, integer, text, text) to authenticated, service_role;
revoke execute on function public.my_gift_card_purchases(text, integer) from public, anon;
grant execute on function public.my_gift_card_purchases(text, integer) to authenticated, service_role;

revoke execute on function public.attach_gift_card_session(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_gift_card_session(uuid, text) to service_role;
revoke execute on function public.confirm_gift_card_purchase(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.confirm_gift_card_purchase(text, integer, text, text) to service_role;
