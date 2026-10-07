/*
 * Related searches, as on Amazon's results page: other things shoppers in the same store searched
 * for that share a word with this search ("wireless earbuds" → "wireless headphones",
 * "earbuds with mic").
 *
 * The results page records each search it shows a first page of results for. Only searches whose
 * words find a product in that store are kept, so the list never holds junk typed into the box,
 * and a term has to be searched a few times before it's suggested to anyone. Nothing ties a term to
 * the shopper who searched it.
 */

-- what search compares: lower case, letters and digits only, single spaces (as search_suggest)
create function public.search_term(p_q text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p_q, '')), '[^[:alnum:]]+', ' ', 'g')), '')
$$;

revoke execute on function public.search_term(text) from public;

create table public.search_terms (
  market_id        text not null references public.markets (id) on delete cascade,
  term             text not null check (length(term) between 2 and 60),
  words            text[] generated always as (string_to_array(term, ' ')) stored,
  searches         integer not null default 1 check (searches > 0),
  last_searched_at timestamptz not null default now(),
  primary key (market_id, term)
);

create index search_terms_words_idx on public.search_terms using gin (words);

-- only the functions below read or write it
alter table public.search_terms enable row level security;
revoke all on public.search_terms from anon, authenticated;

/**
 * Counts one search. Ignored (no error) when the words are too short or too long to be a search
 * worth suggesting, or find nothing in the store.
 */
create function public.record_search(p_market text, p_q text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term text := public.search_term(p_q);
begin
  if v_term is null or length(v_term) not between 2 and 60 or cardinality(string_to_array(v_term, ' ')) > 6 then
    return;
  end if;
  if not exists (
    select 1
    from public.catalog_products cp
    join public.products p on p.id = cp.id
    where cp.market_id = p_market and p.search_doc @@ public.to_prefix_tsquery(v_term)
  ) then
    return;
  end if;

  insert into public.search_terms as t (market_id, term)
  values (p_market, v_term)
  on conflict (market_id, term) do update
    set searches = t.searches + 1, last_searched_at = now();
end
$$;

revoke execute on function public.record_search(text, text) from public;
grant execute on function public.record_search(text, text) to anon, authenticated, service_role;

/**
 * Up to p_limit (at most 20) other searches in the store that share a word of three or more letters
 * with this one, as a JSON array of strings: most words in common first, then the most searched,
 * then the most recent. A term must have been searched at least 3 times; the same words in another
 * order don't count as a different search, and a term that no longer finds anything is skipped.
 */
create function public.related_searches(p_market text, p_q text, p_limit integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_term  text := public.search_term(p_q);
  v_all   text[];
  v_words text[];
  v_result jsonb;
begin
  if v_term is null then
    return '[]'::jsonb;
  end if;
  v_all := string_to_array(v_term, ' ');
  v_words := array(select distinct w from unnest(v_all) as w where length(w) > 2);
  if cardinality(v_words) = 0 then
    return '[]'::jsonb;
  end if;

  with candidates as (
    select t.term, t.searches, t.last_searched_at,
           (select count(distinct w) from unnest(t.words) as w where w = any (v_words)) as shared
    from public.search_terms t
    where t.market_id = p_market
      and t.searches >= 3
      and t.words && v_words
      and not (t.words @> v_all and t.words <@ v_all)
    order by shared desc, t.searches desc, t.last_searched_at desc, t.term
    limit 40
  ),
  live as (
    select c.*
    from candidates c
    where exists (
      select 1
      from public.catalog_products cp
      join public.products p on p.id = cp.id
      where cp.market_id = p_market and p.search_doc @@ public.to_prefix_tsquery(c.term)
    )
    order by c.shared desc, c.searches desc, c.last_searched_at desc, c.term
    limit least(greatest(coalesce(p_limit, 8), 1), 20)
  )
  select coalesce(jsonb_agg(l.term order by l.shared desc, l.searches desc, l.last_searched_at desc, l.term), '[]'::jsonb)
  into v_result
  from live l;

  return v_result;
end
$$;

revoke execute on function public.related_searches(text, text, integer) from public;
grant execute on function public.related_searches(text, text, integer) to anon, authenticated, service_role;
