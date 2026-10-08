/*
 * "Contact seller", as on Amazon: a shopper asks one of the store's sellers about an item, its
 * delivery or a return, optionally about one of their orders with that seller's items in it. It's
 * a support case with the seller on it (support_cases.seller): the same thread, limits and
 * statuses as "Contact us", and the store's admins answer it on the seller's behalf, as the
 * sellers here have no accounts of their own.
 */

alter table public.support_cases
  add column seller text check (seller is null or char_length(seller) between 1 and 120);

create index support_cases_seller_idx on public.support_cases (market_id, seller) where seller is not null;

create or replace function private.support_case_json(c public.support_cases)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'market_id', c.market_id, 'user_id', c.user_id, 'customer_name', c.customer_name,
    'order_id', c.order_id, 'topic', c.topic, 'subject', c.subject, 'status', c.status,
    'created_at', c.created_at, 'updated_at', c.updated_at, 'closed_at', c.closed_at, 'seller', c.seller
  )
$$;

/**
 * Open a case with one of the store's sellers (anyone selling a product in it, archived ones
 * included). `p_order`, when given, must be one of the caller's orders in that store with an item
 * the seller sold. Otherwise as open_support_case: the topic, subject and message are checked the
 * same way, and it counts towards the 5 cases waiting or answered per store.
 */
create function public.contact_seller(
  p_market  text,
  p_seller  text,
  p_topic   text,
  p_subject text,
  p_body    text,
  p_order   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_case jsonb;
  v_row  public.support_cases;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_seller is null or not exists (select 1 from public.products p where p.market_id = p_market and p.seller = p_seller) then
    raise exception 'seller_not_found' using errcode = 'P0002';
  end if;
  if p_order is not null and not exists (
    select 1 from public.orders o join public.order_items oi on oi.order_id = o.id
    where o.id = p_order and o.user_id = v_uid and o.market_id = p_market and oi.seller = p_seller
  ) then
    raise exception 'order_not_found' using errcode = 'P0002', detail = 'seller';
  end if;

  v_case := public.open_support_case(p_market, p_topic, p_subject, p_body, p_order);
  update public.support_cases c set seller = p_seller where c.id = (v_case->>'id')::uuid
  returning * into v_row;
  return private.support_case_json(v_row);
end
$$;

revoke execute on function public.contact_seller(text, text, text, text, text, text) from public, anon;
grant execute on function public.contact_seller(text, text, text, text, text, text) to authenticated, service_role;
