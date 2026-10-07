import { describe, expect, it } from 'vitest';
import { DataError } from './data/errors';
import { GST_NAME_MAX, isGstin, normalizeGstin, readGst } from './gst';

describe('isGstin', () => {
  it('takes real GSTINs, check character and all', () => {
    for (const g of ['27AAPFU0939F1ZV', '29AAGCB7383J1Z4', '33AAACH7409R1Z8', '24AAACC1206D1ZM']) expect(isGstin(g)).toBe(true);
  });

  it('refuses a wrong check character, an unknown state or the wrong shape', () => {
    expect(isGstin('27AAPFU0939F1ZW')).toBe(false); // check character
    expect(isGstin('00AAPFU0939F1ZV')).toBe(false); // no state 00
    expect(isGstin('39AAPFU0939F1ZV')).toBe(false); // nor 39
    expect(isGstin('27AAPFU0939F1YV')).toBe(false); // 14th is always Z
    expect(isGstin('27AAPFU0939F0ZV')).toBe(false); // entity number starts at 1
    expect(isGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isGstin('27aapfu0939f1zv')).toBe(false); // normalise first
  });
});

describe('readGst', () => {
  it('tidies what was typed', () => {
    expect(normalizeGstin(' 27aapfu 0939f1zv ')).toBe('27AAPFU0939F1ZV');
    expect(readGst(' 27aapfu0939f1zv', '  Acme   Traders  Pvt Ltd ')).toEqual({ gstin: '27AAPFU0939F1ZV', name: 'Acme Traders Pvt Ltd' });
  });

  it('is none when the GSTIN is blank', () => {
    expect(readGst('', 'Acme')).toBeNull();
    expect(readGst('   ', undefined)).toBeNull();
    expect(readGst(null, null)).toBeNull();
  });

  it('says which field is wrong', () => {
    const fail = (gstin: unknown, name: unknown) => {
      try {
        readGst(gstin, name);
      } catch (err) {
        return err instanceof DataError ? `${err.code}:${err.detail}` : String(err);
      }
      return 'ok';
    };
    expect(fail('27AAPFU0939F1ZW', 'Acme')).toBe('invalid_input:gstin');
    expect(fail('27AAPFU0939F1ZV', '  ')).toBe('invalid_input:gstName');
    expect(fail('27AAPFU0939F1ZV', 'x'.repeat(GST_NAME_MAX + 1))).toBe('invalid_input:gstName');
    expect(fail('27AAPFU0939F1ZV', 'x'.repeat(GST_NAME_MAX))).toBe('ok');
  });
});
