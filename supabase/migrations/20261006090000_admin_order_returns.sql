-- ===========================================================================
-- Returns on the admin order pages
-- ===========================================================================
-- Admins can read returns and their items (the orders list marks orders with
-- a return), and admin_order_returns() gives one order's returns in the same
-- shape as admin_list_returns(), oldest first, for the order detail page.
-- Writes still go through the admin_* return functions only.

create policy "admins read returns" on public.returns
  for select to authenticated using ((select public.is_admin()));
create policy "admins read return items" on public.return_items
  for select to authenticated using ((select public.is_admin()));

create function public.admin_order_returns(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(private.admin_return_json(r.id) order by r.created_at, r.id)
    from public.returns r
    where r.order_id = p_order_id
  ), '[]'::jsonb);
end
$$;

revoke execute on function public.admin_order_returns(text) from public, anon;
grant execute on function public.admin_order_returns(text) to authenticated, service_role;
