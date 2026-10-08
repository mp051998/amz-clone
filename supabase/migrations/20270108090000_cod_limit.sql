-- Pay on Delivery has a ceiling, as on amazon.in: an order over ₹50,000 can't be paid for at the door
-- (`markets.cod_max_minor`, on the order's total; null is no ceiling, and the US has no Pay on Delivery).
-- place_order() is left as it is: a trigger on orders refuses the insert, so the cart, Buy Now and
-- every later copy of place_order() keep to it.
alter table public.markets
  add column cod_max_minor integer check (cod_max_minor > 0);
update public.markets set cod_max_minor = 5000000 where id = 'IN';

create function private.orders_cod_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max integer;
begin
  select m.cod_max_minor into v_max from public.markets m where m.id = new.market_id;
  if v_max is not null and new.total_minor > v_max then
    raise exception 'cod_unavailable' using errcode = '22023';
  end if;
  return new;
end
$$;

create trigger orders_cod_limit
  before insert on public.orders
  for each row
  when (new.payment_method = 'cod')
  execute function private.orders_cod_limit();
