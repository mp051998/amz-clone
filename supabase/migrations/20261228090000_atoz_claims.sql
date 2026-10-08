/*
 * A-to-z Guarantee claims, as on Amazon: when something bought from one of the store's other
 * sellers (not Amazon itself) never turned up or isn't what was described, and contacting the
 * seller didn't sort it out, the shopper files a claim and the store steps in.
 *
 * A claim is about one seller's items in one order. It can be filed once the order is delivered
 * and until 90 days after, only after the shopper has contacted that seller about the order
 * (Contact seller, a support case with the seller on it) and given them 2 days to answer, and
 * only while some of the seller's items are left that haven't been returned or refunded. Cash on
 * delivery orders can't claim a package didn't arrive: their money is only taken when it does.
 * One claim per order and seller; a withdrawn one can be filed again, a denied one can't.
 *
 * The store's admins review it. Granting refunds everything left from that seller in the order
 * at once (items, their protection plans, and their share of tax and delivery) as a return with
 * reason 'atoz_claim' that's received the moment it's made, as nothing is sent back: card
 * refunds then go to Stripe as for any return, and orders paid from the balance are refunded to
 * it by the returns_refund_balance trigger. Denying it needs a note the shopper sees. Until then
 * the shopper can withdraw it.
 *
 * Shoppers read their own claims and admins read every claim; all writes go through the
 * functions below. Claims don't count towards a product's return signals.
 */

alter table public.returns drop constraint returns_reason_check;
alter table public.returns add constraint returns_reason_check check (reason in (
  'no_longer_needed', 'bought_by_mistake', 'better_price',
  'damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described', 'not_received', 'atoz_claim'));

create table public.atoz_claims (
  id            uuid primary key default gen_random_uuid(),
  order_id      text not null references public.orders (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  market_id     text not null references public.markets (id),
  seller        text not null check (char_length(seller) between 1 and 120),
  reason        text not null check (reason in ('not_received', 'not_as_described')),
  details       text not null check (char_length(details) between 10 and 2000),
  status        text not null default 'under_review' check (status in ('under_review', 'granted', 'denied', 'withdrawn')),
  decision_note text check (decision_note is null or char_length(decision_note) between 1 and 1000),
  return_id     uuid references public.returns (id) on delete set null,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references auth.users (id) on delete set null,
  withdrawn_at  timestamptz,
  check ((status in ('granted', 'denied')) = (decided_at is not null)),
  check ((status = 'withdrawn') = (withdrawn_at is not null)),
  check (status <> 'denied' or decision_note is not null)
);

-- one claim per order and seller, unless it was withdrawn
create unique index atoz_claims_one_per_seller on public.atoz_claims (order_id, seller) where status <> 'withdrawn';
create index atoz_claims_user_idx on public.atoz_claims (user_id, created_at desc);
create index atoz_claims_queue_idx on public.atoz_claims (market_id, status, created_at);
create index atoz_claims_return_idx on public.atoz_claims (return_id) where return_id is not null;

alter table public.atoz_claims enable row level security;

create policy "own claims, or any as an admin" on public.atoz_claims
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

revoke all on public.atoz_claims from anon;
revoke insert, update, delete, truncate on public.atoz_claims from authenticated;

/** A claim as the functions answer it, with its refund once granted. */
create function private.atoz_claim_json(c public.atoz_claims)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'order_id', c.order_id, 'market_id', c.market_id, 'seller', c.seller, 'reason', c.reason,
    'details', c.details, 'status', c.status, 'decision_note', c.decision_note, 'return_id', c.return_id,
    'created_at', c.created_at, 'decided_at', c.decided_at, 'withdrawn_at', c.withdrawn_at,
    'refund', (
      select jsonb_build_object('refund_minor', r.refund_minor, 'refund_status', r.refund_status, 'refunded_at', r.refunded_at)
      from public.returns r
      where r.id = c.return_id
    )
  )
$$;

/** Whether a seller is the store itself, whose orders its own customer service looks after. */
create function private.is_store_seller(p_seller text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_seller ~* '^amazon(\.com|\.in)?$', false)
$$;

/**
 * File a claim about one seller's items in the caller's order. Raises invalid_input (reason |
 * details | seller), order_not_found, and claim_not_allowed with detail sold_by_amazon |
 * not_delivered | window_closed | cash_on_delivery | already_claimed | contact_seller_first |
 * wait_for_seller | nothing_left.
 */
create function public.file_atoz_claim(p_order_id text, p_seller text, p_reason text, p_details text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_details text := btrim(coalesce(p_details, ''));
  v_o       public.orders;
  v_asked   timestamptz;
  v_left    integer;
  v_row     public.atoz_claims;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('not_received', 'not_as_described') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  if char_length(v_details) not between 10 and 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'details';
  end if;

  select * into v_o
  from public.orders o
  where o.id = p_order_id and o.user_id = v_uid
  for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_seller is null or not exists (select 1 from public.order_items oi where oi.order_id = p_order_id and oi.seller = p_seller) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'seller';
  end if;
  if private.is_store_seller(p_seller) then
    raise exception 'claim_not_allowed' using errcode = 'P0001', detail = 'sold_by_amazon';
  end if;
  if v_o.status <> 'placed' or v_o.delivered_at is null or v_o.delivered_at > now() then
    raise exception 'claim_not_allowed' using errcode = 'P0001', detail = 'not_delivered';
  end if;
  if now() > v_o.delivered_at + interval '90 days' then
    raise exception 'claim_not_allowed' using errcode = 'P0001', detail = 'window_closed';
  end if;
  if p_reason = 'not_received' and v_o.payment_method = 'cod' then
    raise exception 'claim_not_allowed' using errcode = 'P0001', detail = 'cash_on_delivery';
  end if;
  if exists (select 1 from public.atoz_claims c where c.order_id = p_order_id and c.seller = p_seller and c.status <> 'withdrawn') then
    raise exception 'claim_not_allowed' using errcode = 'P0001', detail = 'already_claimed';
  end if;

  -- the seller gets the first go: a case with them about this order, 2 days old
  select min(c.created_at) into v_asked
  from public.support_cases c
  where c.order_id = p_order_id and c.seller = p_seller and c.user_id = v_uid;
  if v_asked is null then
    raise exception 'claim_not_allowed' using errcode = 'P0001', detail = 'contact_seller_first';
  end if;
  if v_asked > now() - interval '48 hours' then
    raise exception 'claim_not_allowed' using errcode = 'P0001', detail = 'wait_for_seller';
  end if;

  select coalesce(sum(x.left_qty), 0) into v_left
  from private.return_counts(p_order_id) x
  join public.order_items oi on oi.order_id = p_order_id and oi.product_id = x.product_id
  where oi.seller = p_seller;
  if v_left <= 0 then
    raise exception 'claim_not_allowed' using errcode = 'P0001', detail = 'nothing_left';
  end if;

  insert into public.atoz_claims (order_id, user_id, market_id, seller, reason, details)
  values (p_order_id, v_uid, v_o.market_id, p_seller, p_reason, v_details)
  returning * into v_row;
  return private.atoz_claim_json(v_row);
end
$$;

/** Withdraw the caller's claim while it's under review. Raises claim_not_found, claim_not_open. */
create function public.withdraw_atoz_claim(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.atoz_claims;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.atoz_claims c
     set status = 'withdrawn', withdrawn_at = now()
   where c.id = p_claim_id and c.user_id = v_uid and c.status = 'under_review'
  returning * into v_row;
  if not found then
    if exists (select 1 from public.atoz_claims c where c.id = p_claim_id and c.user_id = v_uid) then
      raise exception 'claim_not_open' using errcode = 'P0001';
    end if;
    raise exception 'claim_not_found' using errcode = 'P0002';
  end if;
  return private.atoz_claim_json(v_row);
end
$$;

/**
 * An admin's decision on a claim under review. Granting refunds everything left from the seller
 * in the order (see above); denying needs `p_note`, which the shopper sees. Raises forbidden,
 * invalid_input (note), claim_not_found, claim_not_open, and claim_not_allowed (nothing_left)
 * when granting a claim whose items have all been returned or refunded meanwhile.
 */
create function public.decide_atoz_claim(p_claim_id uuid, p_grant boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_c          public.atoz_claims;
  v_o          record;
  v_qty        integer;
  v_items      integer;
  v_prot       integer;
  v_left       integer;
  v_prior_tax  integer;
  v_prior_ship integer;
  v_tax        integer;
  v_ship       integer;
  v_code       text := upper(md5(gen_random_uuid()::text));
  v_id         uuid;
begin
  perform private.require_admin();
  if p_grant is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'grant';
  end if;
  if char_length(v_note) > 1000 or (not p_grant and v_note is null) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;

  select * into v_c from public.atoz_claims c where c.id = p_claim_id for update;
  if not found then
    raise exception 'claim_not_found' using errcode = 'P0002';
  end if;
  if v_c.status <> 'under_review' then
    raise exception 'claim_not_open' using errcode = 'P0001';
  end if;

  if not p_grant then
    update public.atoz_claims c
       set status = 'denied', decision_note = v_note, decided_at = now(), decided_by = auth.uid()
     where c.id = p_claim_id
    returning * into v_c;
    return private.atoz_claim_json(v_c);
  end if;

  select o.id, o.user_id, o.payment_method, o.subtotal_minor - o.discount_minor as paid_minor, o.tax_minor, o.ship_minor
    into v_o
  from public.orders o
  where o.id = v_c.order_id
  for update;

  -- what's left of the seller's items, and of the whole order once they're refunded
  select coalesce(sum(x.left_qty), 0)::integer,
         coalesce(sum(x.left_qty * (oi.unit_price_minor - oi.unit_discount_minor)), 0)::integer,
         coalesce(sum(x.left_qty * oi.protection_minor), 0)::integer
    into v_qty, v_items, v_prot
  from private.return_counts(v_c.order_id) x
  join public.order_items oi on oi.order_id = v_c.order_id and oi.product_id = x.product_id
  where oi.seller = v_c.seller and x.left_qty > 0;
  if v_qty = 0 then
    raise exception 'claim_not_allowed' using errcode = 'P0001', detail = 'nothing_left';
  end if;
  select coalesce(sum(greatest(x.left_qty, 0)), 0)::integer - v_qty into v_left from private.return_counts(v_c.order_id) x;

  -- their share of tax (the rest of it when nothing else is left) and of delivery, as for a
  -- return the store is at fault for
  select coalesce(sum(r.tax_minor), 0), coalesce(sum(r.ship_minor), 0)
    into v_prior_tax, v_prior_ship
  from public.returns r
  where r.order_id = v_c.order_id and r.status in ('requested', 'received');
  v_tax := case
    when v_left = 0 then v_o.tax_minor - v_prior_tax
    else least(round(v_o.tax_minor::numeric * v_items / nullif(v_o.paid_minor, 0))::integer, v_o.tax_minor - v_prior_tax)
  end;
  v_ship := least(round(v_o.ship_minor::numeric * v_items / nullif(v_o.paid_minor, 0))::integer, v_o.ship_minor - v_prior_ship);

  insert into public.returns (order_id, user_id, reason, resolution, items_minor, tax_minor, ship_minor, protection_minor,
                              dropoff_code, dropoff_by)
  values (v_c.order_id, v_o.user_id, 'atoz_claim', 'refund', v_items, greatest(coalesce(v_tax, 0), 0), greatest(coalesce(v_ship, 0), 0), v_prot,
          substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), now())
  returning id into v_id;

  insert into public.return_items (return_id, order_id, product_id, qty)
  select v_id, v_c.order_id, x.product_id, x.left_qty
  from private.return_counts(v_c.order_id) x
  join public.order_items oi on oi.order_id = v_c.order_id and oi.product_id = x.product_id
  where oi.seller = v_c.seller and x.left_qty > 0;

  -- nothing comes back: received now, and refunded unless a card refund has to go to Stripe
  update public.returns r
     set status = 'received',
         received_at = now(),
         refund_status = case when v_o.payment_method = 'card' and r.refund_minor > 0 then 'pending' else 'succeeded' end,
         refunded_at = case when v_o.payment_method = 'card' and r.refund_minor > 0 then null else now() end
   where r.id = v_id;

  update public.atoz_claims c
     set status = 'granted', decision_note = v_note, decided_at = now(), decided_by = auth.uid(), return_id = v_id
   where c.id = p_claim_id
  returning * into v_c;
  return private.atoz_claim_json(v_c);
end
$$;

/**
 * admin_atoz_claim_items(p_claim_ids): for the admin claim queue, each claim's items from the
 * claimed seller in its order, keyed by claim id, in order line order (admins can't read other
 * shoppers' orders directly). Raises forbidden.
 */
create function public.admin_atoz_claim_items(p_claim_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_object_agg(c.id, coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', i.product_id, 'title', i.title, 'image', i.image,
               'qty', i.qty, 'unit_price_minor', i.unit_price_minor) order by i.line_no)
        from public.order_items i
       where i.order_id = c.order_id and i.seller = c.seller), '[]'::jsonb))
      from public.atoz_claims c
     where c.id = any(coalesce(p_claim_ids, '{}'))
  ), '{}'::jsonb);
end
$$;

revoke execute on function private.atoz_claim_json(public.atoz_claims) from public, anon, authenticated;
revoke execute on function private.is_store_seller(text) from public, anon, authenticated;
revoke execute on function public.file_atoz_claim(text, text, text, text) from public, anon;
revoke execute on function public.withdraw_atoz_claim(uuid) from public, anon;
revoke execute on function public.decide_atoz_claim(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_atoz_claim_items(uuid[]) from public, anon;
grant execute on function public.file_atoz_claim(text, text, text, text) to authenticated, service_role;
grant execute on function public.withdraw_atoz_claim(uuid) to authenticated, service_role;
grant execute on function public.decide_atoz_claim(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.admin_atoz_claim_items(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- product_return_signal (as in 20261128090000_usually_kept): a claim's refund says nothing
-- about how often the product comes back
-- ---------------------------------------------------------------------------
create or replace function public.product_return_signal(p_product text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with sold as (
    select oi.order_id, oi.qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id = p_product
      and o.status = 'placed'
      and o.delivered_at <= now()
      and o.delivered_at > now() - interval '90 days'
  ),
  back as (
    select r.id, r.reason, ri.qty
    from public.return_items ri
    join public.returns r on r.id = ri.return_id
    where ri.product_id = p_product
      and ri.order_id in (select s.order_id from sold s)
      and r.status not in ('cancelled', 'rejected')
      and r.reason not in ('not_received', 'atoz_claim')
  ),
  totals as (
    select
      (select coalesce(sum(s.qty), 0) from sold s) as sold,
      (select coalesce(sum(b.qty), 0) from back b) as returned,
      (select count(distinct b.id) from back b) as returns
  ),
  verdict as (
    select
      t.sold >= 10 and t.returns >= 2 and t.returned * 10 >= t.sold as frequent,
      t.sold >= 20 and t.returned * 50 <= t.sold as kept
    from totals t
  )
  select jsonb_build_object(
    'frequent', v.frequent,
    'kept', v.kept,
    'reason', case when v.frequent then (
      select b.reason
      from back b
      where b.reason in ('damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described')
      group by b.reason
      order by sum(b.qty) desc, b.reason
      limit 1
    ) end
  )
  from verdict v
$$;
