import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CLIMATE_CERT, CLIMATE_CERTS, climateCerts, isClimateCert } from './climate';
import { toProduct } from './data/map';
import { parseQuery } from './search';

it('knows the certifications, each with a name and what it means', () => {
  expect(isClimateCert('organic')).toBe(true);
  expect(isClimateCert('bogus')).toBe(false);
  for (const c of CLIMATE_CERTS) expect(CLIMATE_CERT[c].name && CLIMATE_CERT[c].desc).toBeTruthy();
});

it('reads a product’s certifications, known ones only, in a fixed order', () => {
  expect(climateCerts(['safer', 'bogus', 'compact'])).toEqual(['compact', 'safer']);
  expect(climateCerts(null)).toEqual([]);
  expect(climateCerts('organic')).toEqual([]);
});

it('allows the same certifications the database does', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20270115090000_climate_pledge.sql'), 'utf8');
  const allowed = /climate <@ array\[([^\]]+)\]/.exec(sql)![1].match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1));
  expect(allowed).toEqual([...CLIMATE_CERTS]);
});

it('maps a catalog row’s certifications, and none when it has none', () => {
  expect(toProduct({ id: 'a', climate: ['recycled', 'carbon'] }).climate).toEqual(['carbon', 'recycled']);
  expect(toProduct({ id: 'a', climate: [] })).not.toHaveProperty('climate');
  // rows read before the migration have none
  expect(toProduct({ id: 'a' })).not.toHaveProperty('climate');
});

it('reads the search filter from climate=1 only', () => {
  expect(parseQuery({ climate: '1' }).climate).toBe(true);
  expect(parseQuery({ climate: '0' }).climate).toBeUndefined();
  expect(parseQuery({}).climate).toBeUndefined();
});
