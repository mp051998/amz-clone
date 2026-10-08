import { describe, expect, it } from 'vitest';
import { allowedBeforeSecondStep, owesSecondStep, readCode, tokenAal, verifiedFactor } from './two-step';

const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const on = { factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] };
const settingUp = { factors: [{ id: 'f0', factor_type: 'totp', status: 'unverified' }] };

describe('tokenAal', () => {
  it('reads the assurance level a token was issued at', () => {
    expect(tokenAal(jwt({ sub: 'u', aal: 'aal1' }))).toBe('aal1');
    expect(tokenAal(jwt({ sub: 'u', aal: 'aal2', name: 'Zoë ~?>' }))).toBe('aal2');
  });

  it('is null for anything it can’t read', () => {
    expect(tokenAal(null)).toBeNull();
    expect(tokenAal('')).toBeNull();
    expect(tokenAal('not-a-jwt')).toBeNull();
    expect(tokenAal('h.%%%.s')).toBeNull();
    expect(tokenAal(jwt({ sub: 'u' }))).toBeNull();
    expect(tokenAal(jwt({ aal: 2 }))).toBeNull();
  });
});

describe('verifiedFactor', () => {
  it('is the authenticator app once it’s confirmed', () => {
    expect(verifiedFactor(on)).toMatchObject({ id: 'f1' });
    expect(verifiedFactor({ factors: [{ id: 'f2', status: 'verified' }] })).toMatchObject({ id: 'f2' });
  });

  it('ignores ones still being set up, and other kinds', () => {
    expect(verifiedFactor(settingUp)).toBeNull();
    expect(verifiedFactor({ factors: [{ id: 'p', factor_type: 'phone', status: 'verified' }] })).toBeNull();
    expect(verifiedFactor({ factors: null })).toBeNull();
    expect(verifiedFactor({})).toBeNull();
    expect(verifiedFactor(null)).toBeNull();
  });
});

describe('owesSecondStep', () => {
  it('is a password sign-in with two-step verification on', () => {
    expect(owesSecondStep(on, jwt({ aal: 'aal1' }))).toBe(true);
    expect(owesSecondStep(on, jwt({}))).toBe(true);
    expect(owesSecondStep(on, null)).toBe(true);
  });

  it('is settled by the code, or when it isn’t on', () => {
    expect(owesSecondStep(on, jwt({ aal: 'aal2' }))).toBe(false);
    expect(owesSecondStep(settingUp, jwt({ aal: 'aal1' }))).toBe(false);
    expect(owesSecondStep({}, jwt({ aal: 'aal1' }))).toBe(false);
    expect(owesSecondStep(null, jwt({ aal: 'aal1' }))).toBe(false);
  });
});

describe('readCode', () => {
  it('takes the 6 digits however they’re typed', () => {
    expect(readCode('123456')).toBe('123456');
    expect(readCode(' 123 456 ')).toBe('123456');
    expect(readCode('123-456')).toBe('123456');
  });

  it('rejects anything else', () => {
    for (const raw of ['12345', '1234567', '12a456', '', null, undefined, 123456]) expect(readCode(raw)).toBeNull();
  });
});

describe('allowedBeforeSecondStep', () => {
  it('lets a half-signed-in visitor reach the code page, emailed links and the API', () => {
    for (const p of ['/signin/verify', '/in/signin/verify', '/auth/confirm', '/in/auth/confirm', '/api/v1/me']) expect(allowedBeforeSecondStep(p)).toBe(true);
  });

  it('keeps them off everything else', () => {
    for (const p of ['/', '/in', '/account', '/in/account/security', '/signin', '/cart', '/signin/verify/x', '/inbox', '/authors']) expect(allowedBeforeSecondStep(p)).toBe(false);
  });
});
