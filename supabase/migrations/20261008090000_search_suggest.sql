/*
 * Search-as-you-type for the header search box. The last word typed counts as
 * a prefix, as in search itself. Returns
 *   total:       matching products, each variant group once
 *   terms:       up to 4 completions of the last word taken from the matching
 *                titles and brands, most common first, as whole queries
 *   departments: the 2 departments with the most matches for the top
 *                completion (so "pres" suggests "pressure in Home & Kitchen",
 *                not a department that only has preschoolers' toys)
 *   products:    the 4 best-reviewed matches, one per variant group
 * Under two characters (after dropping punctuation) everything is empty.
 */
create function public.search_suggest(p_market text, p_q text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_q     text := left(btrim(regexp_replace(lower(coalesce(p_q, '')), '[^[:alnum:]]+', ' ', 'g')), 80);
  v_query tsquery;
  v_last  text;
  v_head  text;
  v_result jsonb;
begin
  if length(v_q) < 2 then
    return jsonb_build_object('total', 0, 'terms', '[]'::jsonb, 'departments', '[]'::jsonb, 'products', '[]'::jsonb);
  end if;
  v_query := public.to_prefix_tsquery(v_q);
  -- only letters and digits are left, so the last word is safe inside a pattern
  v_last := regexp_replace(v_q, '^.* ', '');
  v_head := case when position(' ' in v_q) > 0 then regexp_replace(v_q, ' [^ ]*$', '') || ' ' else '' end;

  with hits as (
    select cp.id, cp.title, cp.brand, cp.image, cp.category_slug, cp.category_name,
           cp.review_count, cp.rating, cp.position, coalesce(cp.variant_group, cp.id) as card
    from public.catalog_products cp
    join public.products p on p.id = cp.id
    where cp.market_id = p_market and p.search_doc @@ v_query
  ),
  words as (
    select w.word, count(distinct h.card) as n
    from hits h
    cross join lateral (
      select distinct m[1] as word
      from regexp_matches(lower(h.title || ' ' || coalesce(h.brand, '')), '\m(' || v_last || '[[:alnum:]]*)', 'g') as m
    ) w
    where length(w.word) > 2 -- "so" and "of" aren't worth suggesting
    group by w.word
  ),
  top as (
    select word from words order by n desc, length(word), word limit 1
  ),
  cards as (
    select distinct on (h.card) h.*
    from hits h
    order by h.card, h.review_count desc, h.rating desc, h.position
  )
  select jsonb_build_object(
    'total', (select count(*) from cards),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object('text', v_head || t.word, 'count', t.n) order by t.n desc, length(t.word), t.word)
      from (select * from words order by n desc, length(word), word limit 4) t), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object('slug', d.slug, 'name', d.name, 'count', d.n) order by d.n desc, d.slug)
      from (
        select h.category_slug as slug, min(h.category_name) as name, count(distinct h.card) as n
        from hits h
        where h.category_slug is not null
          and (not exists (select 1 from top)
               or lower(h.title || ' ' || coalesce(h.brand, '')) ~ ('\m' || (select word from top) || '\M'))
        group by h.category_slug
        order by n desc, slug
        limit 2
      ) d), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'image', c.image) order by c.review_count desc, c.rating desc, c.position)
      from (select * from cards order by review_count desc, rating desc, position limit 4) c), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;

revoke execute on function public.search_suggest(text, text) from public;
grant execute on function public.search_suggest(text, text) to anon, authenticated, service_role;
