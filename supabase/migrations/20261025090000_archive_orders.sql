-- Archive an order, as on Amazon: it leaves the shopper's order list for an "Archived" view and
-- can be brought back. Nothing else about it changes: it still ships, can be cancelled or
-- returned, and counts for Buy again and verified reviews.

alter table public.orders add column archived_at timestamptz;

-- Owner only. Archiving again keeps the first time; an unpaid card checkout can't be archived
-- (it needs paying or cancelling, and isn't in the order list anyway).
create function public.archive_my_order(p_order_id text, p_archived boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_archived is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select o.status into v_status
  from public.orders o
  where o.id = p_order_id and o.user_id = auth.uid()
  for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_archived and v_status = 'awaiting_payment' then
    raise exception 'order_not_archivable' using errcode = 'P0001';
  end if;

  update public.orders o
     set archived_at = case when p_archived then coalesce(o.archived_at, now()) end
   where o.id = p_order_id;
  return private.order_json(p_order_id);
end
$$;

revoke execute on function public.archive_my_order(text, boolean) from public, anon;
grant execute on function public.archive_my_order(text, boolean) to authenticated, service_role;
