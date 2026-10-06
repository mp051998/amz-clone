-- Close your account (Login & security). The server deletes the auth user through the
-- service-role admin API once the shopper has confirmed with their password and nothing of
-- theirs is still in flight. Everything that only serves the shopper goes with the account
-- (profile, addresses, cart, lists, history, coupons, Plus, gift card balance). The store's
-- financial records stay: orders, returns and gift card purchases lose their link to the
-- account (user_id set null) but keep what was bought, paid and refunded. Reviews, questions
-- and answers already stayed up without the link.

alter table public.orders alter column user_id drop not null;
alter table public.orders drop constraint orders_user_id_fkey;
alter table public.orders
  add constraint orders_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

alter table public.returns alter column user_id drop not null;
alter table public.returns drop constraint returns_user_id_fkey;
alter table public.returns
  add constraint returns_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

alter table public.gift_card_purchases alter column user_id drop not null;
alter table public.gift_card_purchases drop constraint gift_card_purchases_user_id_fkey;
alter table public.gift_card_purchases
  add constraint gift_card_purchases_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

/**
 * What stands in the way of closing the caller's account, and what they'd lose:
 *   unpaidOrders       card checkouts never paid (their stock is held: pay or cancel them)
 *   openOrders         placed orders not delivered yet
 *   openReturns        returns waiting to be dropped off or received
 *   pendingRefunds     order or return refunds still on their way
 *   giftCardCheckouts  gift card checkouts whose Stripe page may still be paid (an hour)
 *   balances           gift card balance left in each store [{market, currency, balanceMinor}]
 * The account can close when every count is 0. Runs as the caller: RLS shows only their rows.
 */
create function public.account_closure_check()
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return jsonb_build_object(
    'unpaidOrders', (select count(*) from public.orders o where o.user_id = v_uid and o.status = 'awaiting_payment'),
    'openOrders', (select count(*) from public.orders o
                    where o.user_id = v_uid and o.status = 'placed' and (o.delivered_at is null or o.delivered_at > now())),
    'openReturns', (select count(*) from public.returns r where r.user_id = v_uid and r.status = 'requested'),
    'pendingRefunds', (select count(*) from public.orders o where o.user_id = v_uid and o.refund_status = 'pending')
                    + (select count(*) from public.returns r where r.user_id = v_uid and r.refund_status = 'pending'),
    'giftCardCheckouts', (select count(*) from public.gift_card_purchases g
                           where g.user_id = v_uid and g.status = 'awaiting_payment' and g.created_at > now() - interval '1 hour'),
    'balances', coalesce((
      select jsonb_agg(jsonb_build_object('market', b.market_id, 'currency', m.currency, 'balanceMinor', b.balance_minor) order by b.market_id)
        from public.store_balances b
        join public.markets m on m.id = b.market_id
       where b.user_id = v_uid and b.balance_minor > 0
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.account_closure_check() from public, anon;
grant execute on function public.account_closure_check() to authenticated, service_role;
