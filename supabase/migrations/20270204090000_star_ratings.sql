-- Star-only ratings: a shopper can rate a product without writing a review, as on Amazon ("Rate
-- your purchase"). A rating is a reviews row with an empty headline and review text; a written
-- review has both. Ratings count toward the product's stars and histogram (reviews_rollup is
-- unchanged) but the written-review listing, its facets, search and profiles leave them out.

alter table public.reviews drop constraint reviews_title_check;
alter table public.reviews drop constraint reviews_body_check;

alter table public.reviews
  add constraint reviews_title_check check (char_length(title) <= 120),
  add constraint reviews_body_check check (char_length(body) <= 4000),
  -- both empty (a rating) or both written; never a headline without a review or the other way round
  add constraint reviews_written_or_rating check (
    (title = '' and body = '') or (btrim(title) <> '' and btrim(body) <> '')
  ),
  -- photos belong to a written review
  add constraint reviews_rating_no_photos check (body <> '' or cardinality(photos) = 0);

-- the written-review listing: a product's reviews with words, most helpful first
create index reviews_written_idx on public.reviews (product_id, helpful_count desc, created_at desc)
  where body <> '';
