/*
 * Buying several gift cards at once, as the Quantity on Amazon's gift card page: a purchase is for
 * 1 to 10 cards of the same amount (and recipient and message), paid in one Stripe session for the
 * amount times the quantity, and each card gets its own code. A reload stays a single amount.
 *
 * gift_cards.purchase_id ties each issued card to its purchase (backfilled for the cards bought
 * before); gift_card_purchases.gift_card_code stays the first of them.
 */

alter table public.gift_card_purchases
  add column quantity smallint not null default 1,
  add constraint gift_card_purchases_quantity_check check (quantity between 1 and 10),
  add constraint gift_card_purchases_reload_quantity_check check (not reload or quantity = 1);

alter table public.gift_cards add column purchase_id uuid references public.gift_card_purchases (id) on delete set null;
create index gift_cards_purchase_idx on public.gift_cards (purchase_id) where purchase_id is not null;

update public.gift_cards g
   set purchase_id = p.id
  from public.gift_card_purchases p
 where p.gift_card_code = g.code and g.purchase_id is null;

/*
 * A purchase as the app reads it. `codes` lists every card it issued; `redeemed` is true once all
 * of them have been (for one card, as before, whether its code has been).
 */
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
    'redeemed', coalesce((select bool_and(g.redeemed_at is not null) from public.gift_cards g where g.purchase_id = p.id), false),
    'reload', p.reload,
    'quantity', p.quantity,
    'codes', coalesce(
      (select jsonb_agg(jsonb_build_object('code', g.code, 'redeemed', g.redeemed_at is not null)
                        order by g.code is distinct from p.gift_card_code, g.code)
         from public.gift_cards g
        where g.purchase_id = p.id),
      '[]'::jsonb)
  )
$$;

-- another argument changes the signature, so the old one goes first (two overloads would make
-- every call ambiguous)
drop function public.start_gift_card_purchase(text, integer, text, text);

/**
 * Start buying gift cards: `p_quantity` cards (1 to 10) of `p_amount_minor` each, recorded as
 * awaiting payment and returned. The server then opens a Stripe Checkout Session for the lot.
 */
create function public.start_gift_card_purchase(
  p_market text,
  p_amount_minor integer,
  p_recipient text default null,
  p_message text default null,
  p_quantity integer default 1
)
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
  if p_quantity is null or p_quantity not between 1 and 10 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'quantity';
  end if;
  if char_length(v_recipient) > 60 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'recipient';
  end if;
  if char_length(v_message) > 240 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'message';
  end if;

  insert into public.gift_card_purchases (user_id, market_id, amount_minor, currency, recipient_name, message, quantity)
  values (v_uid, p_market, p_amount_minor, v_currency, v_recipient, v_message, p_quantity)
  returning * into v_p;
  return private.gift_card_purchase_json(v_p);
end
$$;

/**
 * Stripe reported the session paid (service role): check the total (each card's amount times the
 * quantity) and the currency, then issue a code per card, or for a reload credit the buyer's
 * balance, and mark the purchase paid. Idempotent: the success page and the webhook may both get
 * here.
 */
create or replace function public.confirm_gift_card_purchase(p_session_id text, p_amount_minor integer, p_currency text, p_payment_intent text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p     public.gift_card_purchases;
  v_code  text;
  v_first text;
begin
  select * into v_p from public.gift_card_purchases p where p.stripe_session_id = p_session_id for update;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;
  if v_p.status = 'paid' then
    return private.gift_card_purchase_json(v_p);
  end if;
  if p_amount_minor is distinct from v_p.amount_minor * v_p.quantity or lower(coalesce(p_currency, '')) <> lower(v_p.currency) then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  if v_p.reload then
    -- the account was closed after the reload started: there's no balance to pay into
    if v_p.user_id is null then
      raise exception 'purchase_not_found' using errcode = 'P0002';
    end if;
    perform private.move_balance(v_p.user_id, v_p.market_id, v_p.amount_minor, 'reload', p_purchase => v_p.id);
  else
    for i in 1 .. v_p.quantity loop
      loop
        v_code := private.new_gift_code();
        begin
          insert into public.gift_cards (code, market_id, amount_minor, purchased_by, purchase_id)
          values (v_code, v_p.market_id, v_p.amount_minor, v_p.user_id, v_p.id);
          exit;
        exception when unique_violation then
          -- a code collision: draw another
        end;
      end loop;
      v_first := coalesce(v_first, v_code);
    end loop;
  end if;

  update public.gift_card_purchases p
     set status = 'paid', gift_card_code = v_first, paid_at = now(), payment_intent_id = coalesce(p_payment_intent, p.payment_intent_id)
   where p.id = v_p.id
  returning * into v_p;
  return private.gift_card_purchase_json(v_p);
end
$$;

revoke execute on function public.start_gift_card_purchase(text, integer, text, text, integer) from public, anon;
grant execute on function public.start_gift_card_purchase(text, integer, text, text, integer) to authenticated, service_role;
