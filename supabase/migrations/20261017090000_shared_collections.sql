/**
 * Sharing a collection by link (/lists/<token>), the way a list or registry is shared.
 *
 * The owner turns a link on (share_collection) or off (unshare_collection). Anyone with the link
 * reads the list through shared_collection: its name, the sharer's first name and its products,
 * never the note, the prices it was saved at or the owner's id. Tokens are random (122 bits) and
 * made here; turning sharing off and on again makes a new link, so an old one stops working.
 */

alter table public.collections
  add column share_token text unique check (share_token ~ '^[0-9a-f]{32}$'),
  add column shared_at timestamptz;

/** Turn on the link for one of the caller's collections (keeps the current link if it's on). */
create function public.share_collection(p_collection uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c   public.collections;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.collections c
     set share_token = coalesce(c.share_token, replace(gen_random_uuid()::text, '-', '')),
         shared_at = coalesce(c.shared_at, now())
   where c.id = p_collection and c.user_id = v_uid
  returning * into v_c;
  if not found then
    raise exception 'collection_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object('token', v_c.share_token, 'shared_at', v_c.shared_at);
end
$$;

/** Turn the link off; the old link stops working. */
create function public.unshare_collection(p_collection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.collections c
     set share_token = null, shared_at = null
   where c.id = p_collection and c.user_id = v_uid;
  if not found then
    raise exception 'collection_not_found' using errcode = 'P0001';
  end if;
end
$$;

/**
 * A shared list by its link, for anyone (null when the link is off or never existed). `mine` and
 * `collection_id` are only set for the owner, so they can jump back to managing it.
 */
create function public.shared_collection(p_token text)
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
      select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'added_at', i.added_at) order by i.added_at desc, i.product_id)
      from public.collection_items i
      where i.collection_id = c.id
    ), '[]'::jsonb)
  )
  from public.collections c
  where p_token ~ '^[0-9a-f]{32}$' and c.share_token = p_token
$$;

revoke execute on function public.share_collection(uuid) from public, anon;
grant execute on function public.share_collection(uuid) to authenticated, service_role;
revoke execute on function public.unshare_collection(uuid) from public, anon;
grant execute on function public.unshare_collection(uuid) to authenticated, service_role;
revoke execute on function public.shared_collection(text) from public;
grant execute on function public.shared_collection(text) to anon, authenticated, service_role;
