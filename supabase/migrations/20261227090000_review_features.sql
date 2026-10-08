-- "By feature", as on Amazon's reviews: a reviewer can rate a few things about the product
-- ("Easy to use", "Value for money") on 1–5 stars as well as the overall rating. Optional. Which
-- features are asked depends on the category, so the app decides; the table keeps any of them, as
-- feature → stars, and checks the shape. The product page shows each feature's average over its
-- visible reviews once enough have rated it.

alter table public.reviews
  add column features jsonb not null default '{}'::jsonb
    constraint reviews_features_valid check (
      jsonb_typeof(features) = 'object'
      and jsonb_array_length(jsonb_path_query_array(features, '$.keyvalue()')) <= 8
      and not jsonb_path_exists(features, '$.keyvalue() ? (!(@.key like_regex "^[a-z][a-z_]{1,29}$"))')
      and not jsonb_path_exists(features, '$.* ? (@.type() != "number" || @ < 1 || @ > 5 || @.floor() != @)')
    );

/**
 * Each feature rated on a product's visible reviews: its average (to one decimal) and how many
 * rated it. Read as the caller, so it sees what they can see; a hidden review never counts.
 */
create function public.review_feature_ratings(p_product_id text)
returns table (feature text, average numeric, ratings integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.key, round(avg(f.value::integer), 1), count(*)::integer
    from public.reviews r
    cross join lateral jsonb_each_text(r.features) f
   where r.product_id = p_product_id
     and r.hidden_at is null
     and f.value ~ '^[1-5]$'
   group by f.key
   order by f.key;
$$;

revoke execute on function public.review_feature_ratings(text) from public;
grant execute on function public.review_feature_ratings(text) to anon, authenticated, service_role;
