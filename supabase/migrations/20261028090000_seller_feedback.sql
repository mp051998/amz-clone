-- Seller feedback, as on Amazon: once an order arrives, the shopper can rate each seller in it
-- (1–5 stars, whether it arrived on time and as described, an optional comment) for 90 days,
-- change it in that time, or remove it. Product pages show each seller's rating over the last
-- 12 months: the average, and the share of 4 and 5 star ratings ("positive").
--
-- A shopper reads and removes their own feedback; writes go through leave_seller_feedback(),
-- which checks the order, the seller and the window. Everyone reads the totals through
-- seller_ratings(), never another shopper's feedback.

create table public.seller_feedback (
  order_id        text not null references public.orders (id) on delete cascade,
  seller          text not null,
  market_id       text not null references public.markets (id),
  user_id         uuid references auth.users (id) on delete set null,
  rating          smallint not null check (rating between 1 and 5),
  arrived_on_time boolean,
  as_described    boolean,
  comment         text check (char_length(comment) between 1 and 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (order_id, seller)
);

create index seller_feedback_seller_idx on public.seller_feedback (market_id, seller, created_at desc);
create index seller_feedback_user_idx on public.seller_feedback (user_id);

alter table public.seller_feedback enable row level security;

create policy "see own seller feedback" on public.seller_feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy "remove own seller feedback" on public.seller_feedback
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.seller_feedback from anon;
revoke insert, update, truncate on public.seller_feedback from authenticated;

-- Leave or change feedback for one seller in one of the caller's orders. Blank comment = none.
create function public.leave_seller_feedback(
  p_order_id text,
  p_seller text,
  p_rating integer,
  p_on_time boolean default null,
  p_as_described boolean default null,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_comment text := nullif(btrim(replace(replace(coalesce(p_comment, ''), E'\r\n', E'\n'), E'\r', E'\n')), '');
  v_row public.seller_feedback;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'rating';
  end if;
  if char_length(v_comment) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'comment';
  end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.user_id = auth.uid();
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.order_items i where i.order_id = p_order_id and i.seller = p_seller) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'seller';
  end if;
  if private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at) <> 'delivered'
     or v_order.delivered_at < now() - interval '90 days' then
    raise exception 'feedback_not_open' using errcode = 'P0001';
  end if;

  insert into public.seller_feedback as f (order_id, seller, market_id, user_id, rating, arrived_on_time, as_described, comment)
  values (p_order_id, p_seller, v_order.market_id, auth.uid(), p_rating, p_on_time, p_as_described, v_comment)
  on conflict (order_id, seller) do update
    set rating = excluded.rating,
        arrived_on_time = excluded.arrived_on_time,
        as_described = excluded.as_described,
        comment = excluded.comment,
        updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row) - 'user_id' - 'market_id';
end
$$;

revoke execute on function public.leave_seller_feedback(text, text, integer, boolean, boolean, text) from public, anon;
grant execute on function public.leave_seller_feedback(text, text, integer, boolean, boolean, text) to authenticated, service_role;

-- Each named seller's rating in a store over the last 12 months. Sellers without any are left out.
create function public.seller_ratings(p_market text, p_sellers text[])
returns table (seller text, ratings integer, average numeric, positive integer)
language sql
stable
security definer
set search_path = ''
as $$
  select f.seller, count(*)::integer, round(avg(f.rating), 1), (count(*) filter (where f.rating >= 4))::integer
  from public.seller_feedback f
  where f.market_id = p_market and f.seller = any (p_sellers) and f.created_at > now() - interval '12 months'
  group by f.seller
$$;

revoke execute on function public.seller_ratings(text, text[]) from public;
grant execute on function public.seller_ratings(text, text[]) to anon, authenticated, service_role;
