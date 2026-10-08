import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

it('marks the same seeded reviews Vine on a fresh database as on one seeded before the migration', () => {
  const mark = 'update public.reviews set vine = true where seeded and private.is_vine_sample(product_id, author_name);';
  expect(read('supabase/migrations/20270118090000_vine_reviews.sql')).toContain(mark);
  expect(read('supabase/seed.sql')).toContain(mark);
});
