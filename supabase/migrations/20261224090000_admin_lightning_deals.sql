/*
 * Store admins run Lightning Deals too (/admin/deals, /api/v1/admin/lightning-deals), as sellers
 * do in Seller Central: pick a product, a deal price, how many units and when, for up to 12 hours.
 * One starting now goes live at once. An admin can cancel a deal before it starts, or end a live
 * one early, which puts the price back. The store's own planner keeps filling the hours around them.
 */

alter table public.lightning_deals drop constraint lightning_deals_end_reason_check;
-- cancelled: an admin called it off, before it started or while it was live
alter table public.lightning_deals add constraint lightning_deals_end_reason_check
  check (end_reason in ('time', 'sold_out', 'repriced', 'unavailable', 'cancelled'));

-- who scheduled it; null for the store's own planner
alter table public.lightning_deals add column scheduled_by uuid references auth.users (id) on delete set null;

/**
 * Schedule a deal on a product (admins only), `p_hours` long (1 to 12). Starts now when
 * `p_starts_at` is null or has passed (by up to five minutes: the form's "now"), else then. Up to
 * as many units as are in stock, and not overlapping another of its deals. Returns the deal's id.
 * The insert trigger refuses offers, archived products and a price not below the product's.
 */
create function public.schedule_lightning_deal(
  p_product text,
  p_deal_price_minor integer,
  p_quota integer,
  p_starts_at timestamptz,
  p_hours integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_starts timestamptz := coalesce(p_starts_at, now());
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_product from public.products p where p.id = p_product;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if p_deal_price_minor is null or p_deal_price_minor < 1 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'deal_price_minor';
  end if;
  if p_quota is null or p_quota < 1 or p_quota > v_product.stock then
    raise exception 'invalid_input' using errcode = '22023', detail = 'quota';
  end if;
  if v_starts < now() - interval '5 minutes'
     or (v_product.release_at is not null and v_product.release_at > greatest(v_starts, now())) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'starts_at';
  end if;
  v_starts := greatest(v_starts, now());
  if p_hours is null or p_hours < 1 or p_hours > 12 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'hours';
  end if;
  if exists (
    select 1 from public.lightning_deals d
     where d.product_id = v_product.id and d.ended_at is null
       and d.starts_at < v_starts + make_interval(hours => p_hours) and v_starts < d.ends_at
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'overlap';
  end if;

  insert into public.lightning_deals (product_id, market_id, deal_price_minor, quota, starts_at, ends_at, scheduled_by)
  values (v_product.id, v_product.market_id, p_deal_price_minor, p_quota, v_starts, v_starts + make_interval(hours => p_hours), auth.uid())
  returning id into v_id;
  if v_starts <= now() then
    perform private.start_lightning_deal(v_id);
  end if;
  return v_id;
end
$$;

/**
 * Call a deal off (admins only): one not started yet won't; a live one ends now and the product's
 * price goes back. One already over is left as it ended.
 */
create function public.cancel_lightning_deal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lightning_deals d where d.id = p_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.end_lightning_deal(p_id, 'cancelled');
end
$$;

revoke execute on function public.schedule_lightning_deal(text, integer, integer, timestamptz, integer) from public, anon;
revoke execute on function public.cancel_lightning_deal(uuid) from public, anon;
grant execute on function public.schedule_lightning_deal(text, integer, integer, timestamptz, integer) to authenticated, service_role;
grant execute on function public.cancel_lightning_deal(uuid) to authenticated, service_role;
