/*
 * "Report an issue with this product", as on Amazon's product pages: a signed-in shopper tells the
 * store something is wrong with a listing (details wrong or missing, the price, counterfeit,
 * unsafe or recalled, offensive, something else), and the store's admins work the reports in a
 * queue (/admin/product-reports), resolving (fixed) or dismissing each one.
 *
 * A shopper has at most one open report per product: reporting again while it's open rewrites it.
 * Up to 20 open reports per shopper at a time, so one account can't flood the queue. Nobody
 * replies to a report; the shopper sees on the product page that theirs is open.
 *
 * Shoppers read their own reports; admins read every report. All writes go through the functions
 * below.
 */

create table public.product_reports (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references public.products (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  reporter_name text not null check (char_length(reporter_name) between 1 and 60),
  reason        text not null check (reason in ('wrong_info', 'pricing', 'counterfeit', 'safety', 'offensive', 'other')),
  details       text check (details is null or char_length(details) between 1 and 1000),
  status        text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users (id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(resolution_note) between 1 and 500),
  check ((status = 'open') = (resolved_at is null))
);

create unique index product_reports_one_open_idx on public.product_reports (product_id, user_id) where status = 'open';
create index product_reports_queue_idx on public.product_reports (status, created_at desc);
create index product_reports_user_idx on public.product_reports (user_id, status);
create index product_reports_resolved_by_idx on public.product_reports (resolved_by);

alter table public.product_reports enable row level security;

create policy "own reports, or any as an admin" on public.product_reports
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.product_reports from anon;
revoke insert, update, delete, truncate on public.product_reports from authenticated;

create function private.product_report_json(r public.product_reports)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'product_id', r.product_id, 'reporter_name', r.reporter_name, 'reason', r.reason,
    'details', r.details, 'status', r.status, 'created_at', r.created_at, 'updated_at', r.updated_at,
    'resolved_at', r.resolved_at, 'resolution_note', r.resolution_note
  )
$$;

/**
 * Report an issue with a product (signed in). `p_details` is optional, except for 'other'
 * (10–1000 characters then). While the caller's report on that product is open, this rewrites it
 * (`updated` true in the result).
 */
create function public.report_product(p_product text, p_reason text, p_details text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_details text := nullif(private.qa_text(p_details), '');
  v_row     public.product_reports;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.products p where p.id = p_product) then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if p_reason is null or p_reason not in ('wrong_info', 'pricing', 'counterfeit', 'safety', 'offensive', 'other') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  if char_length(coalesce(v_details, '')) > 1000 or (p_reason = 'other' and char_length(coalesce(v_details, '')) < 10) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'details';
  end if;

  -- one at a time per shopper, so the open count below can't be raced past
  perform pg_advisory_xact_lock(hashtext('product_report:' || v_uid::text));

  update public.product_reports r
     set reason = p_reason, details = v_details, updated_at = now()
   where r.product_id = p_product and r.user_id = v_uid and r.status = 'open'
  returning * into v_row;
  if found then
    return private.product_report_json(v_row) || jsonb_build_object('updated', true);
  end if;

  if (select count(*) from public.product_reports r where r.user_id = v_uid and r.status = 'open') >= 20 then
    raise exception 'too_many_reports' using errcode = 'P0001';
  end if;

  insert into public.product_reports (product_id, user_id, reporter_name, reason, details)
  values (p_product, v_uid, private.qa_author(v_uid), p_reason, v_details)
  returning * into v_row;
  return private.product_report_json(v_row) || jsonb_build_object('updated', false);
end
$$;

/** An admin closes an open report: 'resolved' (the listing was fixed) or 'dismissed', with an optional note. */
create function public.resolve_product_report(p_report uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(private.qa_text(p_note), '');
  v_row  public.product_reports;
begin
  perform private.require_admin();
  if p_status is null or p_status not in ('resolved', 'dismissed') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  select * into v_row from public.product_reports r where r.id = p_report for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'open' then
    raise exception 'report_closed' using errcode = 'P0001';
  end if;
  update public.product_reports r
     set status = p_status, resolved_at = now(), resolved_by = auth.uid(), resolution_note = v_note, updated_at = now()
   where r.id = p_report
  returning * into v_row;
  return private.product_report_json(v_row);
end
$$;

revoke execute on function private.product_report_json(public.product_reports) from public, anon, authenticated;
revoke execute on function public.report_product(text, text, text) from public, anon;
revoke execute on function public.resolve_product_report(uuid, text, text) from public, anon;
grant execute on function public.report_product(text, text, text) to authenticated, service_role;
grant execute on function public.resolve_product_report(uuid, text, text) to authenticated, service_role;
