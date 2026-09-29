-- ===========================================================================
-- India: split three mixed departments into their own categories
-- ===========================================================================
-- Electronics also held smartwatches, Home & Kitchen mixer grinders, and
-- Sports yoga mats, so compare and the decision tools ranked unlike products
-- against each other. They move to Wearables, Kitchen Appliances and Yoga,
-- each listed after the department it came from, with rules insights scored
-- on that category's own attributes.
--
-- Data only, for databases already seeded with the old catalogue. A fresh
-- database (no India categories yet) skips it: seed.sql already has the split.
-- Generated from supabase/seed/catalog-in.json and supabase/seed-insights.sql
-- (scripts/build-catalog-in.mjs, scripts/build-insights.mjs).

do $split$
begin
  if not exists (select 1 from public.market_categories where market_id = 'IN') then
    return;
  end if;

  insert into public.categories (slug, name) values
    ('wearables', 'Wearables'),
    ('kitchen-appliances', 'Kitchen Appliances'),
    ('yoga', 'Yoga')
  on conflict (slug) do nothing;

  insert into public.market_categories (market_id, category_slug, position) values
    ('IN', 'wearables', 1000),
    ('IN', 'kitchen-appliances', 1001),
    ('IN', 'yoga', 1002)
  on conflict (market_id, category_slug) do nothing;

  -- each new category right after the one it splits from, then renumber 0..n-1
  with parent (slug, after) as (
    values ('wearables', 'electronics'), ('kitchen-appliances', 'home-kitchen'), ('yoga', 'sports')
  ),
  ranked as (
    select mc.category_slug,
           (row_number() over (
              order by coalesce(pm.position, mc.position), (pr.slug is not null), mc.position, mc.category_slug
            ) - 1)::integer as pos
    from public.market_categories mc
    left join parent pr on pr.slug = mc.category_slug
    left join public.market_categories pm on pm.market_id = 'IN' and pm.category_slug = pr.after
    where mc.market_id = 'IN'
  )
  update public.market_categories mc
     set position = r.pos
    from ranked r
   where mc.market_id = 'IN' and mc.category_slug = r.category_slug and mc.position <> r.pos;

  update public.products
     set category_slug = 'wearables'
   where market_id = 'IN' and category_slug = 'electronics'
     and id in ('in-819ZWX2Nm9L', 'in-61Cx3vx0mLL', 'in-61aIxLJVJCL', 'in-61ATaTpvEQL', 'in-71JLQrCFFL');

  update public.products
     set category_slug = 'kitchen-appliances'
   where market_id = 'IN' and category_slug = 'home-kitchen'
     and id in ('in-71S8pDT9EiL', 'in-71Swqb9mXvL', 'in-71nBpK0uJL', 'in-61P8ZSaqBHL', 'in-61Cln50mffL');

  update public.products
     set category_slug = 'yoga'
   where market_id = 'IN' and category_slug = 'sports'
     and id in ('in-81qgtF5lNL', 'in-61mx7nZOGnL', 'in-710zYiyB7XL', 'in-51izPGxd0SL');

  update public.products
     set bullets = array['Grinds masalas, chutneys and batters in seconds', 'Stainless steel jars and blades for wet and dry grinding', 'Overload protection keeps the motor safe on long runs', 'Locking lids and anti-skid feet for steady, spill-free use']::text[]
   where id in ('in-71S8pDT9EiL', 'in-71nBpK0uJL', 'in-61P8ZSaqBHL')
     and bullets = array['ISI-marked, made in India for everyday cooking', 'Works on gas and induction cooktops', 'Sturdy build with a secure locking lid', 'Even heat for faster, fuel-saving cooking']::text[];

  update public.products
     set bullets = array['Stainless steel jars and blades for wet and dry grinding', 'Overload protection keeps the motor safe on long runs', 'Locking lids and anti-skid feet for steady, spill-free use', 'Backed by a manufacturer warranty']::text[]
   where id in ('in-71Swqb9mXvL', 'in-61Cln50mffL')
     and bullets = array['Works on gas and induction cooktops', 'Sturdy build with a secure locking lid', 'Even heat for faster, fuel-saving cooking', 'Backed by a manufacturer warranty']::text[];

  update public.products
     set bullets = array['Anti-slip texture keeps you steady in every pose', 'Cushioned, joint-friendly support for floor workouts', 'Light and easy to roll up and carry', 'Sweat-resistant surface that wipes clean']::text[]
   where id in ('in-81qgtF5lNL', 'in-61mx7nZOGnL', 'in-710zYiyB7XL')
     and bullets = array['Adjustable weight adapts as your strength grows', 'Space-saving design for a home gym', 'Secure locking mechanism for safe lifting', 'Durable, non-slip grip handle']::text[];

  update public.products
     set bullets = array['Cushioned, joint-friendly support for floor workouts', 'Light and easy to roll up and carry', 'Sweat-resistant surface that wipes clean', 'Suits yoga, pilates, stretching and home workouts']::text[]
   where id in ('in-51izPGxd0SL')
     and bullets = array['Space-saving design for a home gym', 'Secure locking mechanism for safe lifting', 'Durable, non-slip grip handle', 'Ideal for home strength training']::text[];

  -- moved products: rescored on their new category's attributes (the old scores
  -- use the old category's keys, so an AI summary is replaced too)
  insert into public.product_insights (product_id, scores, pros, cons, best_for, summary, praised, criticized, source)
  select v.product_id, v.scores, v.pros, v.cons, v.best_for, v.summary, v.praised, v.criticized, v.source
  from (values
    ('in-819ZWX2Nm9L', '{"display":5,"battery":2,"fitness":3,"calling":5,"value":2}'::jsonb, array['Display', 'Calls & smart features']::text[], array['Pricier than similar picks', 'Needs charging every couple of days']::text[], 'A watch that looks the part', 'Owners rate it 4.3 out of 5 across 1.2k ratings. Most praise its display and calling & smart features; the most common complaint is pricier than similar picks.', '[{"theme":"Display","count":344},{"theme":"Calls & smart features","count":222},{"theme":"Health & fitness tracking","count":142}]'::jsonb, '[{"theme":"Value for money","count":62},{"theme":"Battery life","count":35}]'::jsonb, 'rules'),
    ('in-61Cx3vx0mLL', '{"display":2,"battery":2,"fitness":4,"calling":3,"value":4}'::jsonb, array['Health & fitness tracking']::text[], array['Needs charging every couple of days', 'Basic display']::text[], 'Workouts & health tracking', 'Owners rate it 3.9 out of 5 across 41.2k ratings. Most praise its fitness tracking and value for money; the most common complaint is needs charging every couple of days.', '[{"theme":"Health & fitness tracking","count":10233},{"theme":"Value for money","count":6622},{"theme":"Calls & smart features","count":4214}]'::jsonb, '[{"theme":"Battery life","count":3618},{"theme":"Display","count":2010}]'::jsonb, 'rules'),
    ('in-61aIxLJVJCL', '{"display":5,"battery":2,"fitness":2,"calling":5,"value":2}'::jsonb, array['Display', 'Calls & smart features']::text[], array['Pricier than similar picks', 'Basic fitness tracking']::text[], 'A watch that looks the part', 'Owners rate it 4.0 out of 5 across 8.8k ratings. Most praise its display and calling & smart features; the most common complaint is pricier than similar picks.', '[{"theme":"Display","count":2174},{"theme":"Calls & smart features","count":1407},{"theme":"Battery life","count":895}]'::jsonb, '[{"theme":"Value for money","count":769},{"theme":"Health & fitness tracking","count":427}]'::jsonb, 'rules'),
    ('in-61ATaTpvEQL', '{"display":1,"battery":4,"fitness":3,"calling":3,"value":3}'::jsonb, array['Battery life']::text[], array['Basic display']::text[], 'Workouts & health tracking', 'Owners rate it 4.0 out of 5 across 15.4k ratings. Most praise its battery life and fitness tracking; the most common complaint is basic display.', '[{"theme":"Battery life","count":3827},{"theme":"Health & fitness tracking","count":2476},{"theme":"Calls & smart features","count":1576}]'::jsonb, '[{"theme":"Display","count":1353},{"theme":"Value for money","count":752}]'::jsonb, 'rules'),
    ('in-71JLQrCFFL', '{"display":4,"battery":2,"fitness":4,"calling":4,"value":4}'::jsonb, array['Display', 'Health & fitness tracking', 'Calls & smart features']::text[], array['Needs charging every couple of days']::text[], 'A watch that looks the part', 'Owners rate it 4.1 out of 5 across 9.3k ratings. Most praise its display and fitness tracking; the most common complaint is needs charging every couple of days.', '[{"theme":"Display","count":2506},{"theme":"Health & fitness tracking","count":1622},{"theme":"Calls & smart features","count":1032}]'::jsonb, '[{"theme":"Battery life","count":630},{"theme":"Value for money","count":350}]'::jsonb, 'rules'),
    ('in-71S8pDT9EiL', '{"power":3,"versatility":4,"durability":3,"ease":3,"value":4}'::jsonb, array['Jars & modes']::text[], array['Can be loud and fiddly']::text[], 'Everyday cooking', 'Owners rate it 4.1 out of 5 across 3.8k ratings. Most praise its versatility and value for money; the most common complaint is can be loud and fiddly.', '[{"theme":"Jars & modes","count":1026},{"theme":"Value for money","count":664},{"theme":"Motor power","count":422}]'::jsonb, '[{"theme":"Ease of use","count":258},{"theme":"Durability","count":143}]'::jsonb, 'rules'),
    ('in-71Swqb9mXvL', '{"power":5,"versatility":5,"durability":4,"ease":3,"value":2}'::jsonb, array['Motor power', 'Jars & modes', 'Durability']::text[], array['Pricier than similar picks']::text[], 'Heavy daily grinding', 'Owners rate it 4.2 out of 5 across 9.1k ratings. Most praise its motor power and versatility; the most common complaint is pricier than similar picks.', '[{"theme":"Motor power","count":2450},{"theme":"Jars & modes","count":1585},{"theme":"Durability","count":1009}]'::jsonb, '[{"theme":"Value for money","count":616},{"theme":"Ease of use","count":342}]'::jsonb, 'rules'),
    ('in-71nBpK0uJL', '{"power":4,"versatility":4,"durability":4,"ease":2,"value":3}'::jsonb, array['Motor power', 'Jars & modes', 'Durability']::text[], array['Can be loud and fiddly']::text[], 'Heavy daily grinding', 'Owners rate it 4.3 out of 5 across 4.2k ratings. Most praise its motor power and versatility; the most common complaint is can be loud and fiddly.', '[{"theme":"Motor power","count":1202},{"theme":"Jars & modes","count":778},{"theme":"Durability","count":495}]'::jsonb, '[{"theme":"Ease of use","count":218},{"theme":"Value for money","count":121}]'::jsonb, 'rules'),
    ('in-61P8ZSaqBHL', '{"power":5,"versatility":3,"durability":5,"ease":2,"value":3}'::jsonb, array['Motor power', 'Durability']::text[], array['Can be loud and fiddly']::text[], 'Heavy daily grinding', 'Owners rate it 4.6 out of 5 across 22.4k ratings. Most praise its motor power and durability; the most common complaint is can be loud and fiddly.', '[{"theme":"Motor power","count":6702},{"theme":"Durability","count":4337},{"theme":"Jars & modes","count":2760}]'::jsonb, '[{"theme":"Ease of use","count":907},{"theme":"Value for money","count":504}]'::jsonb, 'rules'),
    ('in-61Cln50mffL', '{"power":1,"versatility":3,"durability":2,"ease":2,"value":5}'::jsonb, array['Value for money']::text[], array['Struggles with tough grinding', 'Can be loud and fiddly']::text[], 'Getting the most for less', 'Owners rate it 4.2 out of 5 across 18.9k ratings. Most praise its value for money and versatility; the most common complaint is struggles with tough grinding.', '[{"theme":"Value for money","count":5077},{"theme":"Jars & modes","count":3285},{"theme":"Durability","count":2090}]'::jsonb, '[{"theme":"Motor power","count":1276},{"theme":"Ease of use","count":709}]'::jsonb, 'rules'),
    ('in-81qgtF5lNL', '{"grip":3,"cushioning":3,"durability":2,"portability":4,"value":3}'::jsonb, array['Easy to carry']::text[], array['May flake or tear over time']::text[], 'Taking it to class or the gym', 'Owners rate it 4.2 out of 5 across 5.2k ratings. Most praise its portability and grip; the most common complaint is may flake or tear over time.', '[{"theme":"Easy to carry","count":1407},{"theme":"Grip","count":911},{"theme":"Cushioning","count":580}]'::jsonb, '[{"theme":"Durability","count":354},{"theme":"Value for money","count":197}]'::jsonb, 'rules'),
    ('in-61mx7nZOGnL', '{"grip":3,"cushioning":3,"durability":3,"portability":2,"value":4}'::jsonb, array['Value for money']::text[], array['Bulky to carry']::text[], 'Floor work & sensitive joints', 'Owners rate it 4.2 out of 5 across 8.6k ratings. Most praise its value for money and grip; the most common complaint is bulky to carry.', '[{"theme":"Value for money","count":2318},{"theme":"Grip","count":1500},{"theme":"Cushioning","count":954}]'::jsonb, '[{"theme":"Easy to carry","count":583},{"theme":"Durability","count":324}]'::jsonb, 'rules'),
    ('in-710zYiyB7XL', '{"grip":4,"cushioning":5,"durability":4,"portability":3,"value":2}'::jsonb, array['Cushioning', 'Grip', 'Durability']::text[], array['Pricier than similar picks']::text[], 'Regular yoga practice', 'Owners rate it 4.1 out of 5 across 1.1k ratings. Most praise its cushioning and grip; the most common complaint is pricier than similar picks.', '[{"theme":"Cushioning","count":301},{"theme":"Grip","count":195},{"theme":"Durability","count":124}]'::jsonb, '[{"theme":"Value for money","count":76},{"theme":"Easy to carry","count":42}]'::jsonb, 'rules'),
    ('in-51izPGxd0SL', '{"grip":1,"cushioning":1,"durability":1,"portability":2,"value":5}'::jsonb, array['Value for money']::text[], array['May flake or tear over time', 'Thin under the knees']::text[], 'Getting the most for less', 'Owners rate it 4.4 out of 5 across 6.4k ratings. Most praise its value for money and portability; the most common complaint is may flake or tear over time.', '[{"theme":"Value for money","count":1831},{"theme":"Easy to carry","count":1185},{"theme":"Grip","count":754}]'::jsonb, '[{"theme":"Durability","count":332},{"theme":"Cushioning","count":184}]'::jsonb, 'rules')
  ) as v (product_id, scores, pros, cons, best_for, summary, praised, criticized, source)
  join public.products p on p.id = v.product_id and p.category_slug in ('wearables', 'kitchen-appliances', 'yoga')
  on conflict (product_id) do update set
    scores = excluded.scores, pros = excluded.pros, cons = excluded.cons, best_for = excluded.best_for,
    summary = excluded.summary, praised = excluded.praised, criticized = excluded.criticized, source = 'rules';

  -- products left behind: their price rank within the category changed
  insert into public.product_insights (product_id, scores, pros, cons, best_for, summary, praised, criticized, source)
  select v.product_id, v.scores, v.pros, v.cons, v.best_for, v.summary, v.praised, v.criticized, v.source
  from (values
    ('in-711l4y8aNlL', '{"sound":3,"battery":3,"comfort":4,"anc":3,"value":2}'::jsonb, array['Comfort']::text[], array['Pricier than similar picks']::text[], 'Work & calls', 'Owners rate it 4.1 out of 5 across 4.8k ratings. Most praise its comfort and sound quality; the most common complaint is pricier than similar picks.', '[{"theme":"Comfort","count":1286},{"theme":"Sound quality","count":832},{"theme":"Battery life","count":529}]'::jsonb, '[{"theme":"Value for money","count":323},{"theme":"Noise cancellation","count":180}]'::jsonb, 'rules'),
    ('in-61qVKj0RGfL', '{"sound":3,"battery":4,"comfort":2,"anc":5,"value":1}'::jsonb, array['Noise cancellation', 'Battery life']::text[], array['Pricier than similar picks', 'Can feel tight on long wear']::text[], 'Commuting & travel', 'Owners rate it 3.8 out of 5 across 145 ratings. Most praise its noise cancellation and battery life; the most common complaint is pricier than similar picks.', '[{"theme":"Noise cancellation","count":32},{"theme":"Battery life","count":21},{"theme":"Sound quality","count":13}]'::jsonb, '[{"theme":"Value for money","count":17},{"theme":"Comfort","count":9}]'::jsonb, 'rules'),
    ('in-61W5VjoziL', '{"cooking":4,"durability":4,"cleanup":3,"capacity":5,"value":2}'::jsonb, array['Set size & capacity', 'Cooking performance', 'Durability']::text[], array['Pricier than similar picks']::text[], 'Cooking for a family', 'Owners rate it 4.4 out of 5 across 22.3k ratings. Most praise its capacity and cooking performance; the most common complaint is pricier than similar picks.', '[{"theme":"Set size & capacity","count":6357},{"theme":"Cooking performance","count":4113},{"theme":"Durability","count":2618}]'::jsonb, '[{"theme":"Value for money","count":1152},{"theme":"Easy cleanup","count":640}]'::jsonb, 'rules'),
    ('in-619CmDHn8L', '{"cooking":4,"durability":4,"cleanup":3,"capacity":3,"value":4}'::jsonb, array['Cooking performance', 'Durability']::text[], array['Small for family cooking']::text[], 'Everyday home cooking', 'Owners rate it 4.3 out of 5 across 39.8k ratings. Most praise its cooking performance and durability; the most common complaint is small for family cooking.', '[{"theme":"Cooking performance","count":11381},{"theme":"Durability","count":7364},{"theme":"Value for money","count":4686}]'::jsonb, '[{"theme":"Set size & capacity","count":2062},{"theme":"Easy cleanup","count":1146}]'::jsonb, 'rules'),
    ('in-51imT7YoPHL', '{"cooking":4,"durability":4,"cleanup":3,"capacity":4,"value":2}'::jsonb, array['Cooking performance', 'Durability', 'Set size & capacity']::text[], array['Pricier than similar picks']::text[], 'Cooking for a family', 'Owners rate it 3.9 out of 5 across 4.5k ratings. Most praise its cooking performance and durability; the most common complaint is pricier than similar picks.', '[{"theme":"Cooking performance","count":1118},{"theme":"Durability","count":723},{"theme":"Set size & capacity","count":460}]'::jsonb, '[{"theme":"Value for money","count":395},{"theme":"Easy cleanup","count":220}]'::jsonb, 'rules'),
    ('in-71WvlgmKiL', '{"versatility":3,"build":1,"grip":3,"compact":3,"value":4}'::jsonb, array['Value for money']::text[], array['Lighter-duty build']::text[], 'Getting started', 'Owners rate it 4.0 out of 5 across 1.8k ratings. Most praise its value for money and weight range; the most common complaint is lighter-duty build.', '[{"theme":"Value for money","count":437},{"theme":"Weight range","count":282},{"theme":"Grip & comfort","count":180}]'::jsonb, '[{"theme":"Build quality","count":154},{"theme":"Space-saving","count":86}]'::jsonb, 'rules'),
    ('in-51RCPRgChnL', '{"versatility":3,"build":1,"grip":3,"compact":2,"value":4}'::jsonb, array['Value for money']::text[], array['Lighter-duty build', 'Takes up floor space']::text[], 'Getting started', 'Owners rate it 3.7 out of 5 across 5k ratings. Most praise its value for money and weight range; the most common complaint is lighter-duty build.', '[{"theme":"Value for money","count":1100},{"theme":"Weight range","count":712},{"theme":"Grip & comfort","count":453}]'::jsonb, '[{"theme":"Build quality","count":582},{"theme":"Space-saving","count":324}]'::jsonb, 'rules'),
    ('in-71FOccCOQmL', '{"sound":2,"battery":3,"comfort":3,"anc":2,"value":3}'::jsonb, array['Battery life']::text[], array['Limited noise cancellation', 'Average sound quality']::text[], 'Workouts & outdoors', 'Owners rate it 3.9 out of 5 across 7.7k ratings. Most praise its battery life and comfort; the most common complaint is limited noise cancellation.', '[{"theme":"Battery life","count":1911},{"theme":"Comfort","count":1237},{"theme":"Value for money","count":787}]'::jsonb, '[{"theme":"Noise cancellation","count":676},{"theme":"Sound quality","count":375}]'::jsonb, 'rules'),
    ('in-51K1LMDAvkL', '{"cooking":4,"durability":4,"cleanup":3,"capacity":4,"value":3}'::jsonb, array['Cooking performance', 'Durability', 'Set size & capacity']::text[], array['Pricier than similar picks']::text[], 'Cooking for a family', 'Owners rate it 4.3 out of 5 across 39.8k ratings. Most praise its cooking performance and durability; the most common complaint is pricier than similar picks.', '[{"theme":"Cooking performance","count":11367},{"theme":"Durability","count":7355},{"theme":"Set size & capacity","count":4680}]'::jsonb, '[{"theme":"Value for money","count":2060},{"theme":"Easy cleanup","count":1144}]'::jsonb, 'rules'),
    ('in-51ZHXd88HjL', '{"cooking":4,"durability":3,"cleanup":2,"capacity":1,"value":3}'::jsonb, array['Cooking performance']::text[], array['Small for family cooking', 'Takes effort to clean']::text[], 'Everyday home cooking', 'Owners rate it 4.1 out of 5 across 23.5k ratings. Most praise its cooking performance and durability; the most common complaint is small for family cooking.', '[{"theme":"Cooking performance","count":6312},{"theme":"Durability","count":4084},{"theme":"Value for money","count":2599}]'::jsonb, '[{"theme":"Set size & capacity","count":1586},{"theme":"Easy cleanup","count":881}]'::jsonb, 'rules'),
    ('in-61mUc9vBJqL', '{"versatility":4,"build":4,"grip":4,"compact":5,"value":4}'::jsonb, array['Space-saving', 'Weight range', 'Build quality']::text[], array[]::text[], 'Small apartments', 'Owners rate it 4.6 out of 5 across 10.2k ratings. Most praise its space-saving design and weight range.', '[{"theme":"Space-saving","count":3052},{"theme":"Weight range","count":1975},{"theme":"Build quality","count":1257}]'::jsonb, '[{"theme":"Value for money","count":413},{"theme":"Grip & comfort","count":230}]'::jsonb, 'rules')
  ) as v (product_id, scores, pros, cons, best_for, summary, praised, criticized, source)
  join public.products p on p.id = v.product_id and p.category_slug in ('electronics', 'home-kitchen', 'sports')
  on conflict (product_id) do update set
    scores = excluded.scores, pros = excluded.pros, cons = excluded.cons, best_for = excluded.best_for,
    summary = excluded.summary, praised = excluded.praised, criticized = excluded.criticized, source = 'rules'
  where public.product_insights.source = 'rules';

end
$split$;
