-- ===========================================================================
-- Product galleries and variants
-- ===========================================================================
-- products.gallery holds up to 8 more images after the main one (site paths
-- or https URLs; uploaded ones live in the product-images bucket). The product
-- page shows the main image first, then these.
--
-- Variants are sibling products: each keeps its own id, price, stock, reviews
-- and orders, and products in the same store that share a variant_group show
-- each other as options, e.g. Color: Black | Blue. variant_axis names the
-- option ("Color", "Size") and variant_label is this product's value. A label
-- is unique within its group; the app keeps the axis the same across a group.
--
-- The UPDATEs below are data for databases seeded before this migration; a
-- fresh database matches no rows and gets the same groups from seed.sql
-- (supabase/seed/variants.json). Products an admin already grouped are left
-- alone.

alter table public.products
  add column gallery text[] not null default '{}'
    check (cardinality(gallery) <= 8 and array_position(gallery, null) is null),
  add column variant_group text check (variant_group ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  add column variant_axis text check (char_length(variant_axis) between 1 and 30),
  add column variant_label text check (char_length(variant_label) between 1 and 60),
  add constraint products_variant_complete check (
    (variant_group is null) = (variant_axis is null) and (variant_group is null) = (variant_label is null)
  );

comment on column public.products.gallery is 'More product images after the main one (product page, API), at most 8.';
comment on column public.products.variant_group is 'Products of a store sharing this key are shown as options of each other.';
comment on column public.products.variant_axis is 'What the options differ by, e.g. Color or Size (same across a group).';
comment on column public.products.variant_label is 'This product''s option within its group, e.g. Black. Unique per group.';

create unique index products_variant_label_key
  on public.products (market_id, variant_group, lower(variant_label))
  where variant_group is not null;

-- admins write them like the other copy fields (column grants, admin.sql)
grant insert (gallery, variant_group, variant_axis, variant_label),
  update (gallery, variant_group, variant_axis, variant_label)
  on public.products to authenticated;

update public.products p
set variant_group = v.variant_group, variant_axis = v.variant_axis, variant_label = v.variant_label
from (values
  ('41lArSiD5hL', 'sony-wh-ch520', 'Color', 'Black'),
  ('41JACWTwWL', 'sony-wh-ch520', 'Color', 'Blue'),
  ('71dRz5HBeTL', 'brooks-adrenaline-gts-25', 'Color', 'Black'),
  ('81TMcoN7PL', 'brooks-adrenaline-gts-25', 'Color', 'Grey/Yellow'),
  ('61D5ZCSIymL', 'fhumsh-a10-pro', 'Color', 'Black'),
  ('61P4QAI28CL', 'fhumsh-a10-pro', 'Color', 'White'),
  ('in-619CmDHn8L', 'hawkins-contura-black', 'Size', '1.5 Litre'),
  ('in-51K1LMDAvkL', 'hawkins-contura-black', 'Size', '3 Litre'),
  ('in-51LKIBnva1L', 'hawkins-contura-black', 'Size', '3 Litre XT (induction)'),
  ('in-61AccNkmFFL', 'lenovo-v15-g4', 'Configuration', 'Athlon Silver 7120U, 8 GB RAM'),
  ('in-61qLlDAZEL', 'lenovo-v15-g4', 'Configuration', 'Ryzen 5 7520U, 16 GB RAM')
) as v (id, variant_group, variant_axis, variant_label)
where p.id = v.id and p.variant_group is null;
