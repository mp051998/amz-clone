import { describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { DataError } from './errors';
import { categoryReturnDays, categoryReturnPolicy, isReturnable, parseReplacementOnly, parseReturnDays, returnPolicyText, setCategoryReturnDays, setCategoryReturnPolicy } from './return-policy';

describe('returnPolicyText / isReturnable', () => {
  it('says how long, or that it can’t go back', () => {
    expect(returnPolicyText(30)).toBe('30-day refund');
    expect(returnPolicyText(7)).toBe('7-day refund');
    expect(returnPolicyText(0)).toBe('Not returnable');
  });

  it('says when it’s replacement only', () => {
    expect(returnPolicyText(7, true)).toBe('7-day replacement');
    expect(returnPolicyText(7, false)).toBe('7-day refund');
    expect(returnPolicyText(0, true)).toBe('Not returnable');
  });

  it('only a window of 0 days can’t be returned', () => {
    expect(isReturnable({ returnDays: 0 })).toBe(false);
    expect(isReturnable({ returnDays: 7 })).toBe(true);
    expect(isReturnable({})).toBe(true);
  });
});

describe('parseReturnDays', () => {
  it('takes whole days from 0 to 365, blank for the store’s', () => {
    expect(parseReturnDays('7')).toBe(7);
    expect(parseReturnDays(' 0 ')).toBe(0);
    expect(parseReturnDays(365)).toBe(365);
    expect(parseReturnDays('')).toBeNull();
    expect(parseReturnDays('  ')).toBeNull();
    expect(parseReturnDays(null)).toBeNull();
    expect(parseReturnDays(undefined)).toBeNull();
  });

  it('refuses anything else as invalid_input on return_days', () => {
    for (const bad of ['-1', '366', '7.5', 'seven', 1.5, true, {}]) {
      const e = (() => { try { parseReturnDays(bad); } catch (err) { return err; } })();
      expect(e, String(bad)).toBeInstanceOf(DataError);
      expect([(e as DataError).code, (e as DataError).detail]).toEqual(['invalid_input', 'return_days']);
    }
  });
});

/** A query builder that records its calls and resolves to `result`. */
function stub(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'update', 'eq']) q[m] = (...a: unknown[]) => { calls.push([m, ...a]); return q; };
  q.maybeSingle = async () => result;
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
  return { db: q as unknown as Db, calls };
}

describe('categoryReturnDays', () => {
  it('is the category’s own window in the store', async () => {
    const { db, calls } = stub({ data: { return_days: 7 }, error: null });
    expect(await categoryReturnDays(db, 'IN', 'mobiles', 10)).toBe(7);
    expect(calls).toContainEqual(['eq', 'market_id', 'IN']);
    expect(calls).toContainEqual(['eq', 'category_slug', 'mobiles']);
    expect(await categoryReturnDays(stub({ data: { return_days: 0 }, error: null }).db, 'IN', 'beauty', 10)).toBe(0);
  });

  it('falls back to the store’s when it has none, or it can’t be read', async () => {
    expect(await categoryReturnDays(stub({ data: { return_days: null }, error: null }).db, 'US', 'books', 30)).toBe(30);
    expect(await categoryReturnDays(stub({ data: null, error: null }).db, 'US', 'books', 30)).toBe(30);
    expect(await categoryReturnDays(stub({ data: null, error: { message: 'column does not exist' } }).db, 'US', 'books', 30)).toBe(30);
  });
});

describe('setCategoryReturnDays', () => {
  it('updates the category in that store', async () => {
    const { db, calls } = stub({ data: [{ category_slug: 'mobiles' }], error: null });
    await setCategoryReturnDays(db, 'IN', 'mobiles', 7);
    expect(calls).toContainEqual(['update', { return_days: 7 }]);
    expect(calls).toContainEqual(['eq', 'market_id', 'IN']);
  });

  it('is category_not_found when no row changed (not listed there, or not an admin)', async () => {
    await expect(setCategoryReturnDays(stub({ data: [], error: null }).db, 'IN', 'nope', null)).rejects.toMatchObject({ code: 'category_not_found' });
  });
});

describe('categoryReturnPolicy', () => {
  it('is the category’s window and whether it’s replacement only', async () => {
    expect(await categoryReturnPolicy(stub({ data: { return_days: 7, replacement_only: true }, error: null }).db, 'IN', 'mobiles', 10)).toEqual({ days: 7, replacementOnly: true });
    expect(await categoryReturnPolicy(stub({ data: { return_days: null, replacement_only: false }, error: null }).db, 'US', 'books', 30)).toEqual({ days: 30, replacementOnly: false });
    expect(await categoryReturnPolicy(stub({ data: null, error: null }).db, 'US', 'books', 30)).toEqual({ days: 30, replacementOnly: false });
  });

  it('falls back to the window alone before replacement_only is there', async () => {
    // the first read (both columns) fails; categoryReturnDays reads the window
    const results = [{ data: null, error: { message: 'column does not exist' } }, { data: { return_days: 7 }, error: null }];
    const { db } = stub(results[0]);
    (db as unknown as { maybeSingle: () => Promise<unknown> }).maybeSingle = async () => results.shift();
    expect(await categoryReturnPolicy(db, 'IN', 'mobiles', 10)).toEqual({ days: 7, replacementOnly: false });
  });
});

describe('parseReplacementOnly / setCategoryReturnPolicy', () => {
  it('takes true or false only', () => {
    expect(parseReplacementOnly(true)).toBe(true);
    expect(parseReplacementOnly(false)).toBe(false);
    for (const bad of ['true', 1, null, undefined]) {
      expect(() => parseReplacementOnly(bad)).toThrow(expect.objectContaining({ code: 'invalid_input', detail: 'replacement_only' }));
    }
  });

  it('updates only what’s given', async () => {
    const both = stub({ data: [{ category_slug: 'mobiles' }], error: null });
    await setCategoryReturnPolicy(both.db, 'IN', 'mobiles', { days: 7, replacementOnly: true });
    expect(both.calls).toContainEqual(['update', { return_days: 7, replacement_only: true }]);
    const one = stub({ data: [{ category_slug: 'mobiles' }], error: null });
    await setCategoryReturnPolicy(one.db, 'IN', 'mobiles', { replacementOnly: false });
    expect(one.calls).toContainEqual(['update', { replacement_only: false }]);
  });
});
