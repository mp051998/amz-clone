/*
 * Gift card balance: paying with the store balance ('giftcard' in the US,
 * 'amazonpay' in India) used to place the order without taking anything. Now
 * each shopper has a balance per store, topped up by redeeming gift card codes.
 *
 * - gift_cards: one-time codes for an amount in one store. Every account can
 *   claim one demo card per store (markets.demo_gift_card_minor) and redeem it
 *   or pass the code on; anyone signed in can redeem a code once.
 * - store_balances: the balance per shopper and store, never negative.
 * - balance_entries: the history (redeemed cards, orders, refunds).
 *
 * A balance order is paid in full when it's placed (insufficient_balance when
 * the balance doesn't cover the total). Cancelling it, or a received return of
 * it, credits the refund back to the balance. Orders placed before this
 * migration were never charged, so their refunds don't credit anything.
 */
alter table public.markets add column demo_gift_card_minor integer not null default 10000 check (demo_gift_card_minor > 0);
update public.markets set demo_gift_card_minor = case id when 'IN' then 500000 else 10000 end;

create table public.gift_cards (
  code         text primary key check (code ~ '^[0-9A-Z]{4}-[0-9A-Z]{6}-[0-9A-Z]{4}$'),
  market_id    text not null references public.markets (id),
  amount_minor integer not null check (amount_minor > 0),
  -- the account a demo card was issued to
  issued_to    uuid references auth.users (id) on delete cascade,
  redeemed_by  uuid references auth.users (id) on delete set null,
  redeemed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint gift_cards_redeemed_check check (redeemed_by is null or redeemed_at is not null)
);

create unique index gift_cards_one_demo_per_store on public.gift_cards (issued_to, market_id) where issued_to is not null;

create table public.store_balances (
  user_id       uuid not null references auth.users (id) on delete cascade,
  market_id     text not null references public.markets (id),
  balance_minor integer not null default 0 check (balance_minor >= 0),
  updated_at    timestamptz not null default now(),
  primary key (user_id, market_id)
);

create table public.balance_entries (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  market_id      text not null references public.markets (id),
  amount_minor   integer not null check (amount_minor <> 0),
  kind           text not null check (kind in ('gift_card', 'order', 'refund')),
  gift_card_code text references public.gift_cards (code) on delete set null,
  order_id       text references public.orders (id) on delete set null,
  return_id      uuid references public.returns (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index balance_entries_user_idx on public.balance_entries (user_id, market_id, created_at desc);
create index balance_entries_order_idx on public.balance_entries (order_id) where order_id is not null;

alter table public.gift_cards enable row level security;
alter table public.store_balances enable row level security;
alter table public.balance_entries enable row level security;

create policy "read own gift cards" on public.gift_cards
  for select to authenticated
  using (issued_to = (select auth.uid()) or redeemed_by = (select auth.uid()));
create policy "read own balance" on public.store_balances
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "read own balance history" on public.balance_entries
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.gift_cards, public.store_balances, public.balance_entries from anon, authenticated;
revoke all on public.gift_cards, public.store_balances, public.balance_entries from anon;

/**
 * Add (or take, when negative) an amount to a shopper's balance in a store and
 * record why. Taking more than the balance raises insufficient_balance. The
 * balance row is locked, so concurrent orders can't both spend the same money.
 * Returns the new balance.
 */
create function private.move_balance(
  p_user uuid,
  p_market text,
  p_amount integer,
  p_kind text,
  p_code text default null,
  p_order text default null,
  p_return uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  insert into public.store_balances (user_id, market_id) values (p_user, p_market) on conflict do nothing;
  update public.store_balances b
     set balance_minor = b.balance_minor + p_amount, updated_at = now()
   where b.user_id = p_user and b.market_id = p_market and b.balance_minor + p_amount >= 0
  returning b.balance_minor into v_balance;
  if v_balance is null then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;
  insert into public.balance_entries (user_id, market_id, amount_minor, kind, gift_card_code, order_id, return_id)
  values (p_user, p_market, p_amount, p_kind, p_code, p_order, p_return);
  return v_balance;
end
$$;

/** "A1B2-C3D4E5-F6A7" from 14 random hex digits (uuid v4 randomness). */
create function private.new_gift_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_hex text := upper(replace(gen_random_uuid()::text, '-', ''));
  -- skip the uuid's version digit (13th) and variant digit (17th)
  v_raw text := substr(v_hex, 1, 12) || substr(v_hex, 18, 2);
begin
  return substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 6) || '-' || substr(v_raw, 11, 4);
end
$$;

/**
 * The caller's demo gift card for a store: issued on the first call (worth the
 * store's demo_gift_card_minor), the same card after that. Returns
 * { code, market_id, amount_minor, redeemed }.
 */
create function public.claim_demo_gift_card(p_market text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_amount integer;
  v_card   public.gift_cards;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select m.demo_gift_card_minor into v_amount from public.markets m where m.id = p_market;
  if v_amount is null then
    raise exception 'unknown_market' using errcode = '22023';
  end if;

  loop
    select * into v_card from public.gift_cards g where g.issued_to = v_uid and g.market_id = p_market;
    exit when found;
    begin
      insert into public.gift_cards (code, market_id, amount_minor, issued_to)
      values (private.new_gift_code(), p_market, v_amount, v_uid)
      returning * into v_card;
      exit;
    exception when unique_violation then
      null; -- a code collision, or a concurrent claim: look again
    end;
  end loop;

  return jsonb_build_object('code', v_card.code, 'market_id', v_card.market_id,
                            'amount_minor', v_card.amount_minor, 'redeemed', v_card.redeemed_at is not null);
end
$$;

/**
 * Redeem a gift card code into the caller's balance in this store. Spaces,
 * dashes and case don't matter. Returns { amount_minor, balance_minor }.
 */
create function public.redeem_gift_card(p_market text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_raw     text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_card    public.gift_cards;
  v_balance integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if length(v_raw) <> 14 then
    raise exception 'gift_card_not_found' using errcode = 'P0002';
  end if;

  select * into v_card from public.gift_cards g
  where g.code = substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 6) || '-' || substr(v_raw, 11, 4)
  for update;
  if not found then
    raise exception 'gift_card_not_found' using errcode = 'P0002';
  end if;
  if v_card.redeemed_at is not null then
    raise exception 'gift_card_redeemed' using errcode = 'P0001';
  end if;
  if v_card.market_id <> p_market then
    raise exception 'gift_card_other_store' using errcode = 'P0001', detail = v_card.market_id;
  end if;

  update public.gift_cards g set redeemed_by = v_uid, redeemed_at = now() where g.code = v_card.code;
  v_balance := private.move_balance(v_uid, p_market, v_card.amount_minor, 'gift_card', v_card.code);
  return jsonb_build_object('amount_minor', v_card.amount_minor, 'balance_minor', v_balance);
end
$$;

-- Pay a balance order in full as it's placed (place_order inserts it 'placed').
create function private.orders_charge_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.move_balance(new.user_id, new.market_id, -new.total_minor, 'order', null, new.id);
  return null;
end
$$;

create trigger orders_charge_balance
  after insert on public.orders
  for each row
  when (new.payment_method in ('giftcard', 'amazonpay') and new.total_minor > 0)
  execute function private.orders_charge_balance();

-- A cancelled balance order's refund goes back to the balance it was paid from.
create function private.orders_refund_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.balance_entries e where e.order_id = new.id and e.kind = 'order') then
    perform private.move_balance(new.user_id, new.market_id, new.refund_minor, 'refund', null, new.id);
  end if;
  return null;
end
$$;

create trigger orders_refund_balance
  after update of refund_status on public.orders
  for each row
  when (new.refund_status = 'succeeded' and old.refund_status is distinct from 'succeeded'
        and new.payment_method in ('giftcard', 'amazonpay') and coalesce(new.refund_minor, 0) > 0)
  execute function private.orders_refund_balance();

-- A received return of a balance order is refunded to the balance too.
create function private.returns_refund_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders o where o.id = new.order_id;
  if v_order.payment_method in ('giftcard', 'amazonpay')
     and exists (select 1 from public.balance_entries e where e.order_id = v_order.id and e.kind = 'order') then
    perform private.move_balance(v_order.user_id, v_order.market_id, new.refund_minor, 'refund', null, v_order.id, new.id);
  end if;
  return null;
end
$$;

create trigger returns_refund_balance
  after update of refund_status on public.returns
  for each row
  when (new.refund_status = 'succeeded' and old.refund_status is distinct from 'succeeded' and coalesce(new.refund_minor, 0) > 0)
  execute function private.returns_refund_balance();

revoke execute on function private.move_balance(uuid, text, integer, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function private.new_gift_code() from public, anon, authenticated;
revoke execute on function private.orders_charge_balance() from public, anon, authenticated;
revoke execute on function private.orders_refund_balance() from public, anon, authenticated;
revoke execute on function private.returns_refund_balance() from public, anon, authenticated;
revoke execute on function public.claim_demo_gift_card(text) from public, anon;
revoke execute on function public.redeem_gift_card(text, text) from public, anon;
grant execute on function public.claim_demo_gift_card(text) to authenticated, service_role;
grant execute on function public.redeem_gift_card(text, text) to authenticated, service_role;
