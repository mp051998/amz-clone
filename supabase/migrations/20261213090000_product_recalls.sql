/*
 * Recalls and product safety alerts, as on Amazon: when a product turns out to be unsafe, the
 * store's admins recall it (what the hazard is, what shoppers should do). A recall takes the
 * product off sale for good, and is public: the product page says so, /recalls lists the store's
 * recalls, and shoppers who bought it hear about it in their messages and on the order.
 *
 * One recall per product. Issuing it again rewrites the hazard and remedy and keeps the date it was
 * first issued. A recalled product can't be put back on sale.
 */

create table public.product_recalls (
  product_id text primary key references public.products (id) on delete cascade,
  hazard     text not null check (char_length(hazard) between 10 and 500),
  remedy     text not null check (char_length(remedy) between 10 and 500),
  issued_at  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_by  uuid references auth.users (id) on delete set null
);

create index product_recalls_issued_idx on public.product_recalls (issued_at desc);
create index product_recalls_issued_by_idx on public.product_recalls (issued_by);

alter table public.product_recalls enable row level security;

create policy "recalls are public" on public.product_recalls
  for select to anon, authenticated using (true);

-- anyone reads a recall; which admin issued it stays private. Writes go through the function below.
revoke all on public.product_recalls from anon, authenticated;
grant select (product_id, hazard, remedy, issued_at, updated_at) on public.product_recalls to anon, authenticated;

/**
 * An admin recalls a product: the hazard (what's wrong) and the remedy (what to do: stop using it,
 * return it for a refund, …), 10–500 characters each. Takes the product off sale. Issuing it again
 * rewrites the text (`updated` true in the result).
 */
create function public.recall_product(p_product text, p_hazard text, p_remedy text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hazard  text := private.qa_text(p_hazard);
  v_remedy  text := private.qa_text(p_remedy);
  v_updated boolean;
  v_row     public.product_recalls;
begin
  perform private.require_admin();
  if char_length(v_hazard) not between 10 and 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'hazard';
  end if;
  if char_length(v_remedy) not between 10 and 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'remedy';
  end if;
  perform 1 from public.products p where p.id = p_product for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  v_updated := exists (select 1 from public.product_recalls r where r.product_id = p_product);
  insert into public.product_recalls (product_id, hazard, remedy, issued_by)
  values (p_product, v_hazard, v_remedy, auth.uid())
  on conflict (product_id) do update
    set hazard = excluded.hazard, remedy = excluded.remedy, updated_at = now()
  returning * into v_row;

  update public.products p set archived_at = coalesce(p.archived_at, now()) where p.id = p_product;

  return jsonb_build_object(
    'product_id', v_row.product_id, 'hazard', v_row.hazard, 'remedy', v_row.remedy,
    'issued_at', v_row.issued_at, 'updated_at', v_row.updated_at, 'updated', v_updated
  );
end
$$;

revoke execute on function public.recall_product(text, text, text) from public, anon;
grant execute on function public.recall_product(text, text, text) to authenticated, service_role;

-- A recalled product stays off sale: restoring it (clearing archived_at) is refused.
create function private.products_keep_recalled_off_sale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is null and old.archived_at is not null
     and exists (select 1 from public.product_recalls r where r.product_id = new.id) then
    raise exception 'product_recalled' using errcode = 'P0001';
  end if;
  return new;
end
$$;

revoke execute on function private.products_keep_recalled_off_sale() from public, anon, authenticated;

create trigger products_keep_recalled_off_sale
  before update of archived_at on public.products
  for each row execute function private.products_keep_recalled_off_sale();
