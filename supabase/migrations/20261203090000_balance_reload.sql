/*
 * Reloading the balance, as Amazon's "Reload Your Balance" (amazon.in's "Add Money"): a signed-in
 * shopper pays an amount by card on Stripe hosted Checkout and it goes straight onto their
 * balance in that store, with no code to redeem. A reload is a gift card purchase that pays into
 * the buyer's own balance: it starts the same way (start_balance_reload, within the gift card
 * limits), goes through the same Stripe session and webhook, and confirm_gift_card_purchase
 * credits the balance instead of issuing a code. The balance's history shows it as a 'reload'.
 */

alter table public.gift_card_purchases
  add column reload boolean not null default false,
  add constraint gift_card_purchases_reload_check check (not reload or (recipient_name is null and message is null));

alter table public.balance_entries drop constraint balance_entries_kind_check;
alter table public.balance_entries
  add constraint balance_entries_kind_check check (kind in ('gift_card', 'order', 'refund', 'reload'));

-- each purchase pays into the balance at most once
alter table public.balance_entries add column purchase_id uuid references public.gift_card_purchases (id) on delete set null;
create unique index balance_entries_purchase_idx on public.balance_entries (purchase_id) where purchase_id is not null;

-- move_balance() records the purchase a reload paid for. Another argument changes the signature,
-- so the old one goes first (two overloads would make every call ambiguous).
drop function private.move_balance(uuid, text, integer, text, text, text, uuid);

create function private.move_balance(
  p_user uuid,
  p_market text,
  p_amount integer,
  p_kind text,
  p_code text default null,
  p_order text default null,
  p_return uuid default null,
  p_purchase uuid default null
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
  insert into public.balance_entries (user_id, market_id, amount_minor, kind, gift_card_code, order_id, return_id, purchase_id)
  values (p_user, p_market, p_amount, p_kind, p_code, p_order, p_return, p_purchase);
  return v_balance;
end
$$;

revoke execute on function private.move_balance(uuid, text, integer, text, text, text, uuid, uuid) from public, anon, authenticated;

create or replace function private.gift_card_purchase_json(p public.gift_card_purchases)
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
    'redeemed', coalesce((select g.redeemed_at is not null from public.gift_cards g where g.code = p.gift_card_code), false),
    'reload', p.reload
  )
$$;

/**
 * Start reloading the caller's balance in a store: records the reload as awaiting payment and
 * returns it. The server then opens a Stripe Checkout Session for it, as for a gift card.
 */
create function public.start_balance_reload(p_market text, p_amount_minor integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_currency text;
  v_min      integer;
  v_max      integer;
  v_p        public.gift_card_purchases;
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

  insert into public.gift_card_purchases (user_id, market_id, amount_minor, currency, reload)
  values (v_uid, p_market, p_amount_minor, v_currency, true)
  returning * into v_p;
  return private.gift_card_purchase_json(v_p);
end
$$;

/**
 * Stripe reported the session paid (service role): check the amount and currency, then issue the
 * gift card, or for a reload credit the buyer's balance, and mark the purchase paid. Idempotent:
 * the success page and the webhook may both get here.
 */
create or replace function public.confirm_gift_card_purchase(p_session_id text, p_amount_minor integer, p_currency text, p_payment_intent text default null)
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

  if v_p.reload then
    -- the account was closed after the reload started: there's no balance to pay into
    if v_p.user_id is null then
      raise exception 'purchase_not_found' using errcode = 'P0002';
    end if;
    perform private.move_balance(v_p.user_id, v_p.market_id, v_p.amount_minor, 'reload', p_purchase => v_p.id);
  else
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
  end if;

  update public.gift_card_purchases p
     set status = 'paid', gift_card_code = v_code, paid_at = now(), payment_intent_id = coalesce(p_payment_intent, p.payment_intent_id)
   where p.id = v_p.id
  returning * into v_p;
  return private.gift_card_purchase_json(v_p);
end
$$;

revoke execute on function public.start_balance_reload(text, integer) from public, anon;
grant execute on function public.start_balance_reload(text, integer) to authenticated, service_role;
