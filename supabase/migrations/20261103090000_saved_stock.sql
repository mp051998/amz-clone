-- "Back in stock" on saved products. Each item remembers whether its product was in stock when it
-- was saved, stamped by the insert trigger like the saved price, and kept when it moves lists. A
-- product saved while sold out that can be bought again is back in stock.

-- items from before this: count them as saved in stock, so none is wrongly called back
alter table public.collection_items add column saved_in_stock boolean not null default true;

create or replace function public.collection_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_market   text;
  v_price    integer;
  v_stock    integer;
  v_archived timestamptz;
begin
  if tg_op = 'UPDATE' then
    -- items are immutable apart from delete + re-add
    new.collection_id := old.collection_id;
    new.product_id := old.product_id;
    new.saved_price_minor := old.saved_price_minor;
    new.saved_in_stock := old.saved_in_stock;
    new.added_at := old.added_at;
    return new;
  end if;

  select p.price_minor, p.stock, p.archived_at into v_price, v_stock, v_archived
  from public.products p
  join public.collections c on c.id = new.collection_id and c.market_id = p.market_id
  where p.id = new.product_id;
  if v_price is null then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if v_archived is not null then
    raise exception 'product_unavailable' using errcode = 'P0001';
  end if;
  if (select count(*) from public.collection_items i where i.collection_id = new.collection_id) >= 200 then
    raise exception 'collection_item_limit' using errcode = 'P0001', hint = 'At most 200 items per collection.';
  end if;
  if current_setting('app.keep_saved_price', true) = 'on' then
    return new;
  end if;
  new.saved_price_minor := v_price;
  new.saved_in_stock := v_stock > 0;
  new.added_at := now();
  return new;
end
$$;

-- Moving keeps what the item was saved with, now including whether it was in stock.
create or replace function public.move_collection_item(p_from uuid, p_to uuid, p_product text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_from text;
  v_to   text;
  v_item public.collection_items%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select c.market_id into v_from from public.collections c where c.id = p_from and c.user_id = v_uid;
  select c.market_id into v_to from public.collections c where c.id = p_to and c.user_id = v_uid;
  if v_from is null or v_to is null or v_from <> v_to then
    raise exception 'collection_not_found' using errcode = 'P0001';
  end if;
  if p_from = p_to then
    raise exception 'invalid_input' using errcode = 'P0001', hint = 'Pick a different list.';
  end if;

  delete from public.collection_items i
  where i.collection_id = p_from and i.product_id = p_product
  returning * into v_item;
  if v_item.product_id is null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.collection_items i where i.collection_id = p_to and i.product_id = p_product) then
    return;
  end if;

  perform set_config('app.keep_saved_price', 'on', true);
  insert into public.collection_items (collection_id, product_id, saved_price_minor, saved_in_stock, added_at)
  values (p_to, p_product, v_item.saved_price_minor, v_item.saved_in_stock, v_item.added_at);
  perform set_config('app.keep_saved_price', '', true);
end
$$;
