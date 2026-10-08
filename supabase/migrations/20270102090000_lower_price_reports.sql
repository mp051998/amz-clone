/*
 * "Would you like to tell us about a lower price?", as on Amazon's product pages: a signed-in
 * shopper says where they saw the product for less, online (the page's address, price and
 * delivery) or in a shop (its name, town, price and the day), and the store's admins see each
 * product's reports together at /admin/product-reports/lower-prices, with the lowest one against
 * the store's price, and mark them reviewed once they've looked.
 *
 * Only a lower price can be reported (price plus delivery under the product's own). A shopper
 * has one open report per product (telling us again rewrites it) and up to 20 open at a time.
 * Nobody replies; the shopper sees on the product page that theirs is in.
 *
 * Shoppers read their own reports; admins read every report. All writes go through the functions
 * below.
 */

create table public.price_reports (
  id             uuid primary key default gen_random_uuid(),
  product_id     text not null references public.products (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  -- the product's price when it was reported, to compare against
  our_price_minor integer not null check (our_price_minor > 0),
  seen_at        text not null check (seen_at in ('online', 'store')),
  url            text check (url is null or (char_length(url) <= 500 and url ~* '^https?://[^/\s]+\.[^/\s]+(/\S*)?$')),
  store_name     text check (store_name is null or char_length(store_name) between 1 and 80),
  city           text check (city is null or char_length(city) between 1 and 60),
  price_minor    integer not null check (price_minor > 0),
  shipping_minor integer not null default 0 check (shipping_minor >= 0),
  seen_on        date,
  status         text not null default 'open' check (status in ('open', 'reviewed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users (id) on delete set null,
  -- online: the page, and what delivery cost; in a shop: its name, where, and when
  check ((seen_at = 'online') = (url is not null)),
  check ((seen_at = 'store') = (store_name is not null and seen_on is not null)),
  check (seen_at = 'store' or city is null),
  check (seen_at = 'online' or shipping_minor = 0),
  check ((status = 'open') = (reviewed_at is null))
);

create unique index price_reports_one_open_idx on public.price_reports (product_id, user_id) where status = 'open';
create index price_reports_queue_idx on public.price_reports (status, product_id);
create index price_reports_user_idx on public.price_reports (user_id, status);
create index price_reports_reviewed_by_idx on public.price_reports (reviewed_by);

alter table public.price_reports enable row level security;

create policy "own price reports, or any as an admin" on public.price_reports
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.price_reports from anon;
revoke insert, update, delete, truncate on public.price_reports from authenticated;

create function private.price_report_json(r public.price_reports)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'product_id', r.product_id, 'our_price_minor', r.our_price_minor, 'seen_at', r.seen_at,
    'url', r.url, 'store_name', r.store_name, 'city', r.city, 'price_minor', r.price_minor,
    'shipping_minor', r.shipping_minor, 'seen_on', r.seen_on, 'status', r.status,
    'created_at', r.created_at, 'updated_at', r.updated_at, 'reviewed_at', r.reviewed_at
  )
$$;

/**
 * Tell the store about a lower price (signed in). `p_seen_at` 'online' takes `p_url` and
 * `p_shipping_minor`; 'store' takes `p_store`, `p_city` (optional) and `p_seen_on` (within the
 * last 30 days). The price plus delivery has to be under the product's own (`invalid_input`,
 * detail 'price'). While the caller's report on the product is open, this rewrites it (`updated`).
 */
create function public.report_lower_price(
  p_product text,
  p_seen_at text,
  p_price_minor integer,
  p_shipping_minor integer default 0,
  p_url text default null,
  p_store text default null,
  p_city text default null,
  p_seen_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_price integer;
  v_url   text := nullif(btrim(p_url), '');
  v_store text := nullif(private.qa_text(p_store), '');
  v_city  text := nullif(private.qa_text(p_city), '');
  v_ship  integer := coalesce(p_shipping_minor, 0);
  v_row   public.price_reports;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select p.price_minor into v_price from public.products p where p.id = p_product and p.archived_at is null;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if p_seen_at is null or p_seen_at not in ('online', 'store') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'seen_at';
  end if;

  if p_seen_at = 'online' then
    if v_url is null or char_length(v_url) > 500 or v_url !~* '^https?://[^/\s]+\.[^/\s]+(/\S*)?$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'url';
    end if;
    if v_ship < 0 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'shipping';
    end if;
    v_store := null; v_city := null;
  else
    if v_store is null or char_length(v_store) > 80 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'store';
    end if;
    if char_length(coalesce(v_city, '')) > 60 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'city';
    end if;
    -- a day or so either side of today, wherever the shopper is
    if p_seen_on is null or p_seen_on > current_date + 1 or p_seen_on < current_date - 30 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'seen_on';
    end if;
    v_url := null; v_ship := 0;
  end if;
  if p_price_minor is null or p_price_minor < 1 or p_price_minor::bigint + v_ship >= v_price then
    raise exception 'invalid_input' using errcode = '22023', detail = 'price';
  end if;

  -- one at a time per shopper, so the open count below can't be raced past
  perform pg_advisory_xact_lock(hashtext('price_report:' || v_uid::text));

  update public.price_reports r
     set our_price_minor = v_price, seen_at = p_seen_at, url = v_url, store_name = v_store, city = v_city,
         price_minor = p_price_minor, shipping_minor = v_ship,
         seen_on = case when p_seen_at = 'store' then p_seen_on end, updated_at = now()
   where r.product_id = p_product and r.user_id = v_uid and r.status = 'open'
  returning * into v_row;
  if found then
    return private.price_report_json(v_row) || jsonb_build_object('updated', true);
  end if;

  if (select count(*) from public.price_reports r where r.user_id = v_uid and r.status = 'open') >= 20 then
    raise exception 'too_many_reports' using errcode = 'P0001';
  end if;

  insert into public.price_reports (product_id, user_id, our_price_minor, seen_at, url, store_name, city, price_minor, shipping_minor, seen_on)
  values (p_product, v_uid, v_price, p_seen_at, v_url, v_store, v_city, p_price_minor, v_ship,
          case when p_seen_at = 'store' then p_seen_on end)
  returning * into v_row;
  return private.price_report_json(v_row) || jsonb_build_object('updated', false);
end
$$;

/** An admin marks every open lower-price report on a product reviewed. Returns how many. */
create function public.review_price_reports(p_product text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform private.require_admin();
  update public.price_reports r
     set status = 'reviewed', reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
   where r.product_id = p_product and r.status = 'open';
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

revoke execute on function private.price_report_json(public.price_reports) from public, anon, authenticated;
revoke execute on function public.report_lower_price(text, text, integer, integer, text, text, text, date) from public, anon;
grant execute on function public.report_lower_price(text, text, integer, integer, text, text, text, date) to authenticated, service_role;
revoke execute on function public.review_price_reports(text) from public, anon;
grant execute on function public.review_price_reports(text) to authenticated, service_role;
