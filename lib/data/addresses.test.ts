import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS_MAX } from '../contracts';
import { parseAddress } from './addresses';
import { DataError } from './errors';
import { toAddress } from './map';

const US = { fullName: 'Alex Morgan', phone: '2065550123', line1: '410 Terry Ave N', city: 'Seattle', state: 'wa', postcode: '98109' };
const IN = { fullName: 'Aarav Sharma', phone: '9876543210', line1: '12, Prestige Residency', line2: 'Koramangala', city: 'Bengaluru', state: 'Karnataka', postcode: '560034' };

describe('delivery instructions on an address', () => {
  it('keeps the note trimmed, with line breaks as the textarea counts them', () => {
    expect(parseAddress('US', { ...US, instructions: '  Gate code 4321\r\nRing twice  ' }).instructions).toBe('Gate code 4321\nRing twice');
    expect(parseAddress('IN', { ...IN, instructions: 'Leave it with the guard' }).instructions).toBe('Leave it with the guard');
  });

  it('a blank note is none', () => {
    expect(parseAddress('US', { ...US, instructions: '   ' }).instructions).toBeUndefined();
    expect(parseAddress('US', US).instructions).toBeUndefined();
  });

  it(`refuses a note over ${INSTRUCTIONS_MAX} characters`, () => {
    const full = `${'x'.repeat(INSTRUCTIONS_MAX - 2)}\r\ny`;
    expect(parseAddress('US', { ...US, instructions: full }).instructions).toHaveLength(INSTRUCTIONS_MAX);
    let err: unknown;
    try {
      parseAddress('US', { ...US, instructions: 'x'.repeat(INSTRUCTIONS_MAX + 1) });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DataError);
    expect(err).toMatchObject({ code: 'invalid_input', message: `Keep delivery instructions under ${INSTRUCTIONS_MAX} characters` });
  });

  it('reads the note off a saved address', () => {
    const row = {
      id: 'a1', user_id: 'u1', market_id: 'US', full_name: 'Alex Morgan', phone: '2065550123', line1: '410 Terry Ave N', line2: null,
      landmark: null, city: 'Seattle', state: 'WA', postcode: '98109', kind: null, is_default: true, created_at: '', updated_at: '', dropoff: null,
    };
    expect(toAddress({ ...row, instructions: 'Gate code 4321' }).instructions).toBe('Gate code 4321');
    expect(toAddress({ ...row, instructions: null }).instructions).toBeUndefined();
  });
});

describe('drop-off spot on an address', () => {
  it('keeps a known spot, and none for blank or "none"', () => {
    expect(parseAddress('US', { ...US, dropoff: 'front_door' }).dropoff).toBe('front_door');
    expect(parseAddress('IN', { ...IN, dropoff: 'reception' }).dropoff).toBe('reception');
    expect(parseAddress('US', { ...US, dropoff: '' }).dropoff).toBeUndefined();
    expect(parseAddress('US', { ...US, dropoff: 'none' }).dropoff).toBeUndefined();
    expect(parseAddress('US', US).dropoff).toBeUndefined();
  });

  it('refuses a spot that isn’t one', () => {
    expect(() => parseAddress('US', { ...US, dropoff: 'roof' })).toThrow(expect.objectContaining({ code: 'invalid_input', detail: 'dropoff' }));
  });

  it('reads the spot off a saved address, and ignores one it doesn’t know', () => {
    const row = {
      id: 'a1', user_id: 'u1', market_id: 'US', full_name: 'Alex Morgan', phone: '2065550123', line1: '410 Terry Ave N', line2: null,
      landmark: null, city: 'Seattle', state: 'WA', postcode: '98109', kind: null, is_default: true, created_at: '', updated_at: '', instructions: null,
    };
    expect(toAddress({ ...row, dropoff: 'mailroom' }).dropoff).toBe('mailroom');
    expect(toAddress({ ...row, dropoff: null })).not.toHaveProperty('dropoff');
    expect(toAddress({ ...row, dropoff: 'roof' })).not.toHaveProperty('dropoff');
  });
});
