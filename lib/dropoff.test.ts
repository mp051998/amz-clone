import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DROPOFF, DROPOFF_SPOTS, isDropoffSpot, readDropoff } from './dropoff';

it('names each spot, and says where a package was left', () => {
  for (const s of DROPOFF_SPOTS) expect(DROPOFF[s].label && DROPOFF[s].left).toBeTruthy();
  expect(DROPOFF.front_door.left).toBe('Left at the front door');
});

it('reads a spot: none for blank, null for one it doesn’t know', () => {
  expect(isDropoffSpot('garage')).toBe(true);
  expect(isDropoffSpot('roof')).toBe(false);
  expect(readDropoff('garage')).toBe('garage');
  expect(readDropoff('')).toBeUndefined();
  expect(readDropoff(null)).toBeUndefined();
  expect(readDropoff('none')).toBeUndefined();
  expect(readDropoff('roof')).toBeNull();
  expect(readDropoff(3)).toBeNull();
});

it('allows the same spots the database does', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20270117090000_dropoff_spots.sql'), 'utf8');
  for (const m of sql.matchAll(/dropoff in \(([^)]+)\)/g)) {
    expect(m[1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1))).toEqual([...DROPOFF_SPOTS]);
  }
  expect([...sql.matchAll(/dropoff in \(/g)]).toHaveLength(2);
});
