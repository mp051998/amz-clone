-- Amazon tells a shopper when something in their cart has changed price since they put it
-- there ("The price of … has increased from $12.99 to $14.49"). A cart line now keeps the price
-- its product had when it was added; the cart's lines return it as `added_price_minor`.

alter table public.cart_items
  add column added_price_minor integer check (added_price_minor >= 0);

-- lines already in carts start from today's price, so only changes from now on are reported
update public.cart_items ci
   set added_price_minor = p.price_minor
  from public.products p
 where p.id = ci.product_id;

-- ---------------------------------------------------------------------------
-- Every line is created by an insert in a cart RPC (adding, merging a guest cart): it takes
-- the product's price at that moment unless it brings one along.
-- ---------------------------------------------------------------------------
create function private.cart_items_added_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.added_price_minor is null then
    select p.price_minor into new.added_price_minor from public.products p where p.id = new.product_id;
  end if;
  return new;
end
$$;

create trigger cart_items_added_price
  before insert on public.cart_items
  for each row
  execute function private.cart_items_added_price();

revoke execute on function private.cart_items_added_price() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- cart_lines and checkout_json (as in 20261118090000_protection_plans): each line carries the
-- price it was added at.
-- ---------------------------------------------------------------------------
create or replace function private.cart_lines(p_cart uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'qty', x.qty, 'n', x.n, 'selected', x.selected, 'protection', x.protection,
                                    'added_price_minor', x.added_price_minor) order by x.n), '[]'::jsonb)
  from (
    select ci.product_id, ci.qty, ci.selected, ci.protection, ci.added_price_minor, row_number() over (order by ci.added_at, ci.product_id) as n
    from public.cart_items ci
    where p_cart is not null and ci.cart_id = p_cart
  ) x
$$;

create or replace function private.checkout_json(p_market text, p_uid uuid, p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lines jsonb;
  v_count integer;
  v_picked integer;
  v_sub   integer;
  v_disc  integer;
  v_prot  integer;
  v_t     record;
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product', to_jsonb(cp),
      'qty', l.qty,
      'selected', coalesce(l.selected, true),
      'line_total_minor', cp.price_minor * l.qty,
      'in_stock', cp.archived_at is null and cp.stock >= l.qty,
      'available', cp.archived_at is null,
      'coupon', case when cou.percent_off is not null
                     then jsonb_build_object('percent_off', cou.percent_off, 'clipped', cc.user_id is not null) end,
      'discount_minor', private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor) * l.qty,
      'protection_unit_minor', pu.unit,
      'protection', coalesce(l.protection, false) and pu.unit is not null,
      'added_price_minor', l.added_price_minor
    ) order by l.n), '[]'::jsonb),
    coalesce(sum(l.qty), 0)::integer,
    coalesce(sum(l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(cp.price_minor * l.qty) filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(private.coupon_unit_discount(case when cc.user_id is not null then cou.percent_off end, cp.price_minor) * l.qty)
             filter (where coalesce(l.selected, true)), 0)::integer,
    coalesce(sum(pu.unit * l.qty) filter (where coalesce(l.selected, true) and coalesce(l.protection, false)), 0)::integer
  into v_lines, v_count, v_picked, v_sub, v_disc, v_prot
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as l(product_id text, qty integer, n integer, selected boolean, protection boolean, added_price_minor integer)
  join public.catalog_products_all cp on cp.id = l.product_id
  cross join lateral (select private.protection_unit_minor(p_market, cp.category_slug, cp.price_minor) as unit) pu
  left join public.coupons cou on cou.product_id = l.product_id
  left join public.coupon_clips cc on cc.user_id = p_uid and cc.product_id = l.product_id;

  -- delivery's free threshold and tax go by what's paid for the items
  select * into v_t from public.order_totals(p_market, v_sub - v_disc);

  return jsonb_build_object(
    'market', p_market,
    'currency', (select m.currency from public.markets m where m.id = p_market),
    'free_ship_threshold_minor', (select m.free_ship_threshold_minor from public.markets m where m.id = p_market),
    'lines', v_lines,
    'count', v_count,
    'selected_count', v_picked,
    'totals', jsonb_build_object(
      'subtotal_minor', v_sub,
      'discount_minor', v_disc,
      'ship_minor', v_t.ship_minor,
      'tax_minor', v_t.tax_minor,
      'protection_minor', v_prot,
      'total_minor', v_t.total_minor + v_prot
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- cart_merge_guest (as in 20261118090000_protection_plans): a guest's line keeps the price it
-- was added at when it moves into the account's cart.
-- ---------------------------------------------------------------------------
create or replace function public.cart_merge_guest(p_guest_token uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_guest  record;
  v_cart   uuid;
  v_merged integer := 0;
  v_n      integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_guest_token is null then
    return 0;
  end if;

  for v_guest in
    select c.id, c.market_id from public.carts c where c.guest_token = p_guest_token
  loop
    v_cart := private.cart_id(v_guest.market_id, null, true);

    insert into public.cart_items (cart_id, product_id, qty, added_at, protection, added_price_minor)
    select v_cart, gi.product_id, least(gi.qty, m.max_line_qty, greatest(p.stock, 1)), gi.added_at, gi.protection, gi.added_price_minor
    from public.cart_items gi
    join public.products p on p.id = gi.product_id
    join public.markets m on m.id = v_guest.market_id
    where gi.cart_id = v_guest.id and p.stock > 0 and p.archived_at is null
    on conflict (cart_id, product_id) do update
      set qty = least(
        public.cart_items.qty + excluded.qty,
        (select m2.max_line_qty from public.markets m2 where m2.id = v_guest.market_id),
        greatest((select p2.stock from public.products p2 where p2.id = excluded.product_id), 1)
      ),
      protection = public.cart_items.protection or excluded.protection;
    get diagnostics v_n = row_count;
    v_merged := v_merged + v_n;

    delete from public.carts c where c.id = v_guest.id;
  end loop;

  return v_merged;
end
$$;
