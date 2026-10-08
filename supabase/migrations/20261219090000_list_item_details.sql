/*
 * "Add comment, quantity & priority" on list items, as on Amazon's lists: a comment on the item, how
 * many the shopper wants, and a priority from lowest (-2) to highest (2), medium (0) by default.
 *
 * Items are otherwise immutable (delete + re-add stamps today's price), and direct updates stay
 * revoked: the owner sets these through set_collection_item_details(). They move with the item
 * to another list, and anyone with a shared list's link sees them (they're how a gift giver knows
 * what matters most and how many to buy).
 */

alter table public.collection_items
  add column comment  text     not null default '' check (char_length(comment) <= 250),
  add column quantity smallint not null default 1 check (quantity between 1 and 99),
  add column priority smallint not null default 0 check (priority between -2 and 2);

/** Set an item's comment, quantity and/or priority on one of the caller's lists; null leaves one as it is. */
create function public.set_collection_item_details(
  p_collection uuid,
  p_product text,
  p_comment text default null,
  p_quantity integer default null,
  p_priority integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_comment text := btrim(p_comment);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(v_comment) > 250 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'comment', hint = 'Keep the comment under 250 characters.';
  end if;
  if p_quantity is not null and p_quantity not between 1 and 99 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'quantity', hint = 'Choose a quantity from 1 to 99.';
  end if;
  if p_priority is not null and p_priority not between -2 and 2 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'priority', hint = 'Choose a priority from lowest to highest.';
  end if;

  update public.collection_items i
  set comment  = coalesce(v_comment, i.comment),
      quantity = coalesce(p_quantity, i.quantity),
      priority = coalesce(p_priority, i.priority)
  from public.collections c
  where c.id = i.collection_id
    and c.user_id = v_uid
    and i.collection_id = p_collection
    and i.product_id = p_product;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
end
$$;

revoke all on function public.set_collection_item_details(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.set_collection_item_details(uuid, text, text, integer, integer) to authenticated, service_role;

-- Moving keeps what the item was saved with, now including its comment, quantity and priority.
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
  insert into public.collection_items (collection_id, product_id, saved_price_minor, saved_in_stock, added_at, comment, quantity, priority)
  values (p_to, p_product, v_item.saved_price_minor, v_item.saved_in_stock, v_item.added_at, v_item.comment, v_item.quantity, v_item.priority);
  perform set_config('app.keep_saved_price', '', true);
end
$$;

-- A shared list now shows each item's comment, quantity and priority too.
create or replace function public.shared_collection(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', c.name,
    'kind', c.kind,
    'market_id', c.market_id,
    'shared_at', c.shared_at,
    'owner_name', split_part(private.qa_author(c.user_id), ' ', 1),
    'mine', c.user_id is not distinct from (select auth.uid()),
    'collection_id', case when c.user_id is not distinct from (select auth.uid()) then c.id end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', i.product_id,
        'added_at', i.added_at,
        'comment', i.comment,
        'quantity', i.quantity,
        'priority', i.priority,
        'bought', case
          when c.user_id is not distinct from (select auth.uid()) then null
          when g.user_id is null then null
          when g.user_id is not distinct from (select auth.uid()) then 'you'
          else 'someone'
        end
      ) order by i.added_at desc, i.product_id)
      from public.collection_items i
      left join public.collection_gifts g on g.collection_id = i.collection_id and g.product_id = i.product_id
      where i.collection_id = c.id
    ), '[]'::jsonb)
  )
  from public.collections c
  where p_token ~ '^[0-9a-f]{32}$' and c.share_token = p_token
$$;
