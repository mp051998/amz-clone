-- A one-time password at the door for high-value orders, as Amazon asks for: the courier hands the
-- order over only when the shopper reads out its six-digit code. `markets.delivery_otp_min_minor` is
-- the store's threshold on the order's total (India ₹10,000, the US $500; null: never). A trigger
-- gives such an order its `delivery_otp` when it's placed, or when a pickup order is sent to an
-- address instead (a pickup order has its own pickup code, and no courier).
alter table public.markets
  add column delivery_otp_min_minor integer check (delivery_otp_min_minor > 0);
update public.markets set delivery_otp_min_minor = 1000000 where id = 'IN';
update public.markets set delivery_otp_min_minor = 50000 where id = 'US';

alter table public.orders
  add column delivery_otp text check (delivery_otp ~ '^[0-9]{6}$');

create function private.orders_delivery_otp()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_min integer;
begin
  if new.pickup_point_id is null and new.delivery_otp is null then
    select m.delivery_otp_min_minor into v_min from public.markets m where m.id = new.market_id;
    if v_min is not null and new.total_minor >= v_min then
      new.delivery_otp := lpad(floor(random() * 1000000)::integer::text, 6, '0');
    end if;
  end if;
  return new;
end
$$;

create trigger orders_delivery_otp
  before insert or update of pickup_point_id on public.orders
  for each row
  execute function private.orders_delivery_otp();
