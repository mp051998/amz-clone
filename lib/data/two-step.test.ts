import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/config', () => ({ SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon-key', assertSupabaseEnv: () => {} }));

import { confirmTwoStep, enrollTwoStep, turnOffTwoStep, twoStepOn, verifySecondStep } from './two-step';

type Reply = { status?: number; body?: unknown };
interface Call {
  method: string;
  path: string;
  body: unknown;
  auth: string | null;
}

let replies: Record<string, Reply | Reply[]>;
let calls: Call[];

/** Answer `METHOD /path` (under /auth/v1) from `replies`; an array answers successive calls in turn. */
beforeEach(() => {
  replies = {};
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const path = url.replace('https://sb.test/auth/v1', '');
    const method = init.method ?? 'GET';
    const headers = init.headers as Record<string, string>;
    calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: headers.authorization ?? null });
    expect(headers.apikey).toBe('anon-key');
    const queued = replies[`${method} ${path}`];
    const reply = (Array.isArray(queued) ? queued.shift() : queued) ?? { status: 404, body: { msg: 'not stubbed' } };
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const verified = { id: 'f1', factor_type: 'totp', status: 'verified' };
const unverified = { id: 'f0', factor_type: 'totp', status: 'unverified' };
const session = { access_token: 'aal2-token', refresh_token: 'r', expires_in: 3600, token_type: 'bearer', user: { id: 'u1', factors: [verified] } };

describe('twoStepOn', () => {
  it('asks Supabase Auth as the caller', async () => {
    replies['GET /user'] = [{ body: { id: 'u1', factors: [verified] } }, { body: { id: 'u1', factors: [unverified] } }];
    expect(await twoStepOn('tok')).toBe(true);
    expect(await twoStepOn('tok')).toBe(false);
    expect(calls[0].auth).toBe('Bearer tok');
  });

  it('is not_authenticated for a dead token, unavailable when Auth is down', async () => {
    replies['GET /user'] = [{ status: 401, body: { msg: 'invalid JWT' } }, { status: 500, body: { msg: 'boom' } }];
    await expect(twoStepOn('tok')).rejects.toMatchObject({ code: 'not_authenticated' });
    await expect(twoStepOn('tok')).rejects.toMatchObject({ code: 'two_step_unavailable', status: 503 });
  });
});

describe('enrollTwoStep', () => {
  it('drops an unfinished set-up and enrols a fresh authenticator app', async () => {
    replies['GET /user'] = { body: { id: 'u1', factors: [unverified] } };
    replies['DELETE /factors/f0'] = { body: { id: 'f0' } };
    replies['POST /factors'] = { body: { id: 'f9', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCD', uri: 'otpauth://totp/x' } } };
    expect(await enrollTwoStep('tok')).toEqual({ factorId: 'f9', qrCode: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCD', uri: 'otpauth://totp/x' });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /user', 'DELETE /factors/f0', 'POST /factors']);
    expect(calls[2].body).toEqual({ factor_type: 'totp' });
  });

  it('refuses when it’s on already', async () => {
    replies['GET /user'] = { body: { id: 'u1', factors: [verified] } };
    await expect(enrollTwoStep('tok')).rejects.toMatchObject({ code: 'two_step_on', status: 409 });
    expect(calls).toHaveLength(1);
  });

  it('is unavailable when the project doesn’t allow authenticator apps', async () => {
    replies['GET /user'] = { body: { id: 'u1', factors: [] } };
    replies['POST /factors'] = { status: 422, body: { msg: 'MFA enroll is disabled for TOTP' } };
    await expect(enrollTwoStep('tok')).rejects.toMatchObject({ code: 'two_step_unavailable' });
  });
});

describe('confirmTwoStep', () => {
  it('challenges the factor, then verifies the code against it', async () => {
    replies['POST /factors/f1/challenge'] = { body: { id: 'c1' } };
    replies['POST /factors/f1/verify'] = { body: session };
    expect(await confirmTwoStep('tok', 'f1', '123456')).toEqual(session);
    expect(calls[1].body).toEqual({ challenge_id: 'c1', code: '123456' });
  });

  it('is a wrong code when Auth rejects it', async () => {
    replies['POST /factors/f1/challenge'] = { body: { id: 'c1' } };
    replies['POST /factors/f1/verify'] = { status: 422, body: { msg: 'Invalid TOTP code entered' } };
    await expect(confirmTwoStep('tok', 'f1', '000000')).rejects.toMatchObject({ code: 'invalid_input', detail: 'code' });
  });

  it('asks to start again when the factor is gone', async () => {
    replies['POST /factors/gone/challenge'] = { status: 404, body: { msg: 'Factor not found' } };
    await expect(confirmTwoStep('tok', 'gone', '123456')).rejects.toMatchObject({ code: 'invalid_input', detail: 'factor' });
  });

  it('escapes the factor id', async () => {
    await expect(confirmTwoStep('tok', '../user', '123456')).rejects.toBeTruthy();
    expect(calls[0].path).toBe('/factors/..%2Fuser/challenge');
  });
});

describe('verifySecondStep', () => {
  it('verifies the code against the confirmed authenticator app', async () => {
    replies['GET /user'] = { body: { id: 'u1', factors: [unverified, verified] } };
    replies['POST /factors/f1/challenge'] = { body: { id: 'c1' } };
    replies['POST /factors/f1/verify'] = { body: session };
    expect((await verifySecondStep('tok', '123456')).access_token).toBe('aal2-token');
  });

  it('is two_step_off without one', async () => {
    replies['GET /user'] = { body: { id: 'u1', factors: [unverified] } };
    await expect(verifySecondStep('tok', '123456')).rejects.toMatchObject({ code: 'two_step_off' });
  });
});

describe('turnOffTwoStep', () => {
  it('removes every factor, tolerating ones already gone', async () => {
    replies['GET /user'] = { body: { id: 'u1', factors: [verified, unverified] } };
    replies['DELETE /factors/f1'] = { body: { id: 'f1' } };
    await turnOffTwoStep('tok');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /user', 'DELETE /factors/f1', 'DELETE /factors/f0']);
  });

  it('fails when Auth won’t remove it (a session that hasn’t passed it)', async () => {
    replies['GET /user'] = { body: { id: 'u1', factors: [verified] } };
    replies['DELETE /factors/f1'] = { status: 403, body: { msg: 'AAL2 required to unenroll verified factor' } };
    await expect(turnOffTwoStep('tok')).rejects.toMatchObject({ code: 'not_authenticated' });
  });
});
