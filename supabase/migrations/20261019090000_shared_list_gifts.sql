/**
 * "Mark as bought" on shared lists (/lists/<token>), so gift givers don't buy the same thing twice.
 *
 * A signed-in visitor who isn't the owner marks an item on a shared list as bought (here or
 * elsewhere; there's no link to orders) and can undo it. One giver per item: the first mark holds
 * until that giver undoes it. Everyone with the link sees which items are bought, and their own
 * marks as theirs, except the owner, who never sees them (it would spoil the surprise).
 *
 * Marks live in collection_gifts and go with the item: removing it from the list, or moving it to
 * another list, drops the mark. The table has RLS on and no policies: it's only read through
 * shared_collection() and written through mark_shared_gift().
 */

create table public.collection_gifts (
  collection_id uuid not null,
  product_id    text not null,
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (collection_id, product_id),
  foreign key (collection_id, product_id) references public.collection_items (collection_id, product_id) on delete cascade
);

create index collection_gifts_user_idx on public.collection_gifts (user_id);

alter table public.collection_gifts enable row level security;
revoke all on public.collection_gifts from anon, authenticated;

/** Mark (p_bought) or unmark an item on a shared list as bought by the caller. */
create function public.mark_shared_gift(p_token text, p_product text, p_bought boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c   public.collections;
  v_by  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
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
  if not exists (select 1 from public.collection_items i where i.collection_id = v_c.id and i.product_id = p_product) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  if p_bought then
    insert into public.collection_gifts (collection_id, product_id, user_id)
    values (v_c.id, p_product, v_uid)
    on conflict (collection_id, product_id) do nothing;
    select g.user_id into v_by
      from public.collection_gifts g
     where g.collection_id = v_c.id and g.product_id = p_product;
    if v_by is distinct from v_uid then
      raise exception 'gift_already_bought' using errcode = 'P0001';
    end if;
  else
    -- only the giver who marked it can undo; anyone else's undo changes nothing
    delete from public.collection_gifts g
     where g.collection_id = v_c.id and g.product_id = p_product and g.user_id = v_uid;
  end if;
end
$$;

revoke execute on function public.mark_shared_gift(text, text, boolean) from public, anon;
grant execute on function public.mark_shared_gift(text, text, boolean) to authenticated, service_role;

/**
 * As before, plus each item's `bought`: 'you' (the caller marked it), 'someone' (another giver
 * did) or null. Always null for the owner.
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
