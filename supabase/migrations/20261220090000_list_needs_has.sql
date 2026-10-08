/**
 * "Needs 3 · Has 1" on shared lists: gift givers can each buy part of an item's quantity.
 *
 * Until now one giver held an item's mark and nobody else could add theirs. Now each giver marks
 * how many they bought (collection_gifts.quantity), and others can mark the rest until the
 * marks add up to what the owner asked for (collection_items.quantity). An item asked for once
 * works as before: the first mark takes it.
 *
 * shared_collection() gives everyone but the owner each item's `has` (all givers' marks) and
 * `yours` (the caller's). `bought` is 'you' when the caller marked any, 'someone' when other
 * givers' marks cover the quantity. set_shared_gift() marks a number (0 undoes);
 * mark_shared_gift() stays for clients that only mark or undo, and marks whatever is still needed.
 */

alter table public.collection_gifts
  add column quantity smallint not null default 1 check (quantity between 1 and 99),
  drop constraint collection_gifts_pkey,
  add primary key (collection_id, product_id, user_id);

/**
 * Mark how many of an item on a shared list the caller bought; 0 undoes their mark. A null
 * quantity marks all that's still needed (or keeps the caller's mark when nothing is).
 * `gift_already_bought` when other givers' marks already cover it, `gift_too_many` when the
 * number is more than is still needed.
 */
create function public.set_shared_gift(p_token text, p_product text, p_quantity int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_c      public.collections;
  v_need   int;
  v_others int;
  v_mine   boolean;
  v_qty    int := p_quantity;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_qty is not null and (v_qty < 0 or v_qty > 99) then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'quantity', hint = 'Mark between 1 and 99.';
  end if;
  select * into v_c
    from public.collections c
   where p_token ~ '^[0-9a-f]{32}$' and c.share_token = p_token;
  if not found then
    raise exception 'collection_not_found' using errcode = 'P0001';
  end if;
  if v_c.user_id = v_uid then
    raise exception 'own_list' using errcode = 'P0001';
  end if;
  -- one giver at a time per item, so two can't both take the last one
  select i.quantity into v_need
    from public.collection_items i
   where i.collection_id = v_c.id and i.product_id = p_product
     for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  if v_qty = 0 then
    -- only the caller's own mark; anyone else's stays
    delete from public.collection_gifts g
     where g.collection_id = v_c.id and g.product_id = p_product and g.user_id = v_uid;
    return;
  end if;

  select coalesce(sum(g.quantity) filter (where g.user_id <> v_uid), 0),
         coalesce(bool_or(g.user_id = v_uid), false)
    into v_others, v_mine
    from public.collection_gifts g
   where g.collection_id = v_c.id and g.product_id = p_product;

  if v_qty is null then
    if v_need - v_others <= 0 then
      if v_mine then
        return;
      end if;
      raise exception 'gift_already_bought' using errcode = 'P0001';
    end if;
    v_qty := v_need - v_others;
  elsif v_others >= v_need then
    raise exception 'gift_already_bought' using errcode = 'P0001';
  elsif v_others + v_qty > v_need then
    raise exception 'gift_too_many' using errcode = 'P0001', detail = (v_need - v_others)::text;
  end if;

  insert into public.collection_gifts (collection_id, product_id, user_id, quantity)
  values (v_c.id, p_product, v_uid, v_qty)
  on conflict (collection_id, product_id, user_id) do update set quantity = excluded.quantity;
end
$$;

revoke execute on function public.set_shared_gift(text, text, int) from public, anon;
grant execute on function public.set_shared_gift(text, text, int) to authenticated, service_role;

/** Mark (p_bought: all that's still needed) or unmark an item on a shared list as bought by the caller. */
create or replace function public.mark_shared_gift(p_token text, p_product text, p_bought boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.set_shared_gift(p_token, p_product, case when p_bought then null else 0 end)
$$;

/**
 * As before, plus each item's `has` (every giver's marks added up) and `yours` (the caller's),
 * both null for the owner. `bought` is 'you' when the caller marked some, 'someone' when other
 * givers' marks cover the quantity, else null; always null for the owner.
 */
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
        'has', case when c.user_id is not distinct from (select auth.uid()) then null else g.has end,
        'yours', case when c.user_id is not distinct from (select auth.uid()) then null else g.yours end,
        'bought', case
          when c.user_id is not distinct from (select auth.uid()) then null
          when g.yours > 0 then 'you'
          when g.has >= i.quantity then 'someone'
        end
      ) order by i.added_at desc, i.product_id)
      from public.collection_items i
      cross join lateral (
        select coalesce(sum(x.quantity), 0)::int as has,
               coalesce(sum(x.quantity) filter (where x.user_id = (select auth.uid())), 0)::int as yours
          from public.collection_gifts x
         where x.collection_id = i.collection_id and x.product_id = i.product_id
      ) g
      where i.collection_id = c.id
    ), '[]'::jsonb)
  )
  from public.collections c
  where p_token ~ '^[0-9a-f]{32}$' and c.share_token = p_token
$$;
