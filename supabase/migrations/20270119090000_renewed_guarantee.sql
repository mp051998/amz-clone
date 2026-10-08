-- The Renewed Guarantee, as Amazon's in the US: a renewed item (one bought renewed from another
-- seller) that doesn't work as it should goes back for a refund or a replacement within 90 days
-- of delivery, whatever its category's window.
--
-- - markets.renewed_return_days: the store's guarantee; null for none (the India store, where a
--   renewed item has its category's window like anything else).
-- - private.order_item_return_days(): as in 20270103090000_replacement_only.sql, and a renewed
--   line keeps the guarantee's window (or its category's, if longer), for a refund or a
--   replacement. private.return_windows(), order_returns() and request_return() read the line's
--   window, so they follow without changing. Orders placed before keep theirs.

alter table public.markets
  add column renewed_return_days integer check (renewed_return_days between 1 and 365);

update public.markets set renewed_return_days = 90 where id = 'US';

create or replace function private.order_item_return_days()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_days   integer;
  v_renewed_days integer;
begin
  select mc.return_days, mc.replacement_only into new.return_days, new.replacement_only
  from public.orders o
  join public.products p on p.id = new.product_id
  join public.market_categories mc on mc.market_id = o.market_id and mc.category_slug = p.category_slug
  where o.id = new.order_id;
  new.replacement_only := coalesce(new.replacement_only, false);

  -- order_items_condition (before this, by name) has set the line's condition
  if new.condition = 'renewed' then
    select m.return_days, m.renewed_return_days into v_store_days, v_renewed_days
    from public.orders o
    join public.markets m on m.id = o.market_id
    where o.id = new.order_id;
    if v_renewed_days is not null then
      new.return_days := greatest(coalesce(new.return_days, v_store_days), v_renewed_days);
      new.replacement_only := false;
    end if;
  end if;
  return new;
end
$$;
