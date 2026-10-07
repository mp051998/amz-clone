-- Delivery feedback, as Amazon's "How was your delivery?": once an order arrives, the shopper
-- gives the delivery a thumbs up or down, with what went well or wrong and an optional comment,
-- for 30 days. They can change or remove it in that time. It's about the delivery, not the
-- seller (seller feedback) or the product (reviews), and only the shopper and admins see it.
--
-- A shopper reads and removes their own; writes go through leave_delivery_feedback(), which
-- checks the order, the reasons and the window.

create table public.delivery_feedback (
  order_id   text primary key references public.orders (id) on delete cascade,
  market_id  text not null references public.markets (id),
  user_id    uuid references auth.users (id) on delete set null,
  positive   boolean not null,
  reasons    text[] not null default '{}',
  comment    text check (char_length(comment) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index delivery_feedback_user_idx on public.delivery_feedback (user_id);
create index delivery_feedback_market_idx on public.delivery_feedback (market_id, created_at desc);

alter table public.delivery_feedback enable row level security;

create policy "see own delivery feedback" on public.delivery_feedback
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "remove own delivery feedback" on public.delivery_feedback
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.delivery_feedback from anon;
revoke insert, update, truncate on public.delivery_feedback from authenticated;

-- Leave or change the caller's feedback on one of their delivered orders. Reasons must be ones for
-- a thumbs up (positive) or for a thumbs down; repeats drop out. Blank comment = none.
create function public.leave_delivery_feedback(
  p_order_id text,
  p_positive boolean,
  p_reasons text[] default '{}',
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_allowed text[] := case
    when p_positive then array['on_time', 'good_condition', 'followed_instructions', 'courteous']
    else array['late', 'damaged', 'unsafe_spot', 'ignored_instructions', 'wrong_address', 'unprofessional']
  end;
  v_reasons text[];
  v_comment text := nullif(btrim(replace(replace(coalesce(p_comment, ''), E'\r\n', E'\n'), E'\r', E'\n')), '');
  v_row public.delivery_feedback;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_positive is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'positive';
  end if;
  if exists (select 1 from unnest(coalesce(p_reasons, '{}'::text[])) r where r is null or r <> all (v_allowed)) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reasons';
  end if;
  select coalesce(array_agg(a order by array_position(v_allowed, a)), '{}'::text[]) into v_reasons
  from (select distinct unnest(coalesce(p_reasons, '{}'::text[])) a) d;
  if char_length(v_comment) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'comment';
  end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.user_id = auth.uid();
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if private.order_stage(v_order.status, v_order.shipped_at, v_order.out_for_delivery_at, v_order.delivered_at) <> 'delivered'
     or v_order.delivered_at < now() - interval '30 days' then
    raise exception 'feedback_not_open' using errcode = 'P0001';
  end if;

  insert into public.delivery_feedback as f (order_id, market_id, user_id, positive, reasons, comment)
  values (p_order_id, v_order.market_id, auth.uid(), p_positive, v_reasons, v_comment)
  on conflict (order_id) do update
    set positive = excluded.positive,
        reasons = excluded.reasons,
        comment = excluded.comment,
        updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row) - 'user_id' - 'market_id';
end
$$;

revoke execute on function public.leave_delivery_feedback(text, boolean, text[], text) from public, anon;
grant execute on function public.leave_delivery_feedback(text, boolean, text[], text) to authenticated, service_role;
