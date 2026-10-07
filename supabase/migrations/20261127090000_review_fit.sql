-- "How does it fit?": shoppers reviewing clothing and shoes say whether it runs small, is true
-- to size, or runs large. Optional, and only asked on fashion products (the app decides). The
-- product page sums the answers on visible reviews into "Fit: True to size".

alter table public.reviews
  add column fit text check (fit in ('small', 'true_to_size', 'large'));

create index reviews_product_fit_idx on public.reviews (product_id) where fit is not null;
