import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/database.types';
import { DataError } from '@/lib/data/errors';
import { confirmTwoStep, enrollTwoStep, turnOffTwoStep, twoStepOn, verifySecondStep } from '@/lib/data/two-step';
import { tokenAal } from '@/lib/two-step';
import { admin, anon } from './helpers';
import { totp, withCode, wrongCode } from './totp';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** A client acting with just an access token (as an API caller would). */
const as = (token: string) => createClient<Database>(url, anonKey, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
const isWrongCode = (err: unknown) => err instanceof DataError && err.code === 'invalid_input' && err.detail === 'code';

interface Account {
  id: string;
  email: string;
  password: string;
}

async function account(): Promise<Account> {
  const email = `t-${crypto.randomUUID().slice(0, 12)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Ts Shopper' } });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  return { id: data.user.id, email, password };
}

/** Sign in with the password: the first step's access token. */
async function passwordToken(a: Account): Promise<string> {
  const { data, error } = await anon().auth.signInWithPassword({ email: a.email, password: a.password });
  if (error || !data.session) throw error ?? new Error('sign-in failed');
  return data.session.access_token;
}

/** A read anyone may make (the catalogue), with this token. */
const catalogRead = async (token: string) => (await as(token).from('products').select('id').limit(1)).error;

let web: Account;
let api: Account;
let secret = '';

beforeAll(async () => {
  [web, api] = await Promise.all([account(), account()]);
});

afterAll(async () => {
  await Promise.all([web, api].filter(Boolean).map((a) => admin().auth.admin.deleteUser(a.id)));
});

describe('Two-step verification', () => {
  let first: string;
  let full: string;

  it('is set up with an authenticator app, a fresh key each time, and turned on with its code', async () => {
    first = await passwordToken(web);
    expect(await twoStepOn(first)).toBe(false);

    const abandoned = await enrollTwoStep(first);
    const setup = await enrollTwoStep(first);
    expect(setup.factorId).not.toBe(abandoned.factorId);
    expect(setup.qrCode).toMatch(/^data:image\/svg\+xml/);
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.secret).toMatch(/^[A-Z2-7]+=*$/);
    // the unfinished one is dropped
    const factors = await admin().auth.admin.mfa.listFactors({ userId: web.id });
    expect(factors.data?.factors.map((f) => f.id)).toEqual([setup.factorId]);
    secret = setup.secret;

    await expect(confirmTwoStep(first, setup.factorId, wrongCode(secret))).rejects.toMatchObject({ code: 'invalid_input', detail: 'code' });
    expect(await twoStepOn(first)).toBe(false);

    const session = await withCode(secret, (code) => confirmTwoStep(first, setup.factorId, code), isWrongCode);
    full = session.access_token;
    expect(tokenAal(full)).toBe('aal2');
    expect(await twoStepOn(full)).toBe(true);
    await expect(enrollTwoStep(full)).rejects.toMatchObject({ code: 'two_step_on' });
  });

  it('makes a password alone useless against the database, for that account only', async () => {
    // the token from before it was turned on only passed the password
    expect((await catalogRead(first))?.message).toBe('two_step_required');
    const fresh = await passwordToken(web);
    expect(tokenAal(fresh)).toBe('aal1');
    expect((await catalogRead(fresh))?.message).toBe('two_step_required');
    expect((await as(fresh).rpc('watch_lightning_deal', { p_deal: crypto.randomUUID() })).error?.message).toBe('two_step_required');
    // the full session, guests and everyone else are untouched
    expect(await catalogRead(full)).toBeNull();
    expect((await anon().from('products').select('id').limit(1)).error).toBeNull();
    expect(await catalogRead(await passwordToken(api))).toBeNull();
  });

  it('lets the code finish signing in', async () => {
    const fresh = await passwordToken(web);
    await expect(verifySecondStep(fresh, wrongCode(secret))).rejects.toMatchObject({ code: 'invalid_input', detail: 'code' });
    const session = await withCode(secret, (code) => verifySecondStep(fresh, code), isWrongCode);
    expect(tokenAal(session.access_token)).toBe('aal2');
    expect(await catalogRead(session.access_token)).toBeNull();
    // nothing to verify without it on
    await expect(verifySecondStep(await passwordToken(api), totp(secret))).rejects.toMatchObject({ code: 'two_step_off' });
  });

  it('is served by the API: the token, its second step, and turning it on and off', async () => {
    const token = await import('@/app/api/v1/auth/token/route');
    const verify = await import('@/app/api/v1/auth/token/verify/route');
    const me = await import('@/app/api/v1/me/route');
    const setting = await import('@/app/api/v1/me/two-step/route');
    const confirm = await import('@/app/api/v1/me/two-step/verify/route');
    const req = (path: string, init: { method?: string; bearer?: string; body?: unknown } = {}) =>
      new NextRequest(`http://localhost/api/v1${path}`, {
        method: init.method ?? 'GET',
        headers: { 'content-type': 'application/json', 'x-market': 'US', ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    const none = { params: Promise.resolve({}) };
    type Tokens = { accessToken: string; twoStepRequired: boolean };

    // an account without it: a full token straight away
    const plain = (await (await token.POST(req('/auth/token', { method: 'POST', body: { email: api.email, password: api.password } }))).json()) as Tokens;
    expect(plain.twoStepRequired).toBe(false);
    expect(await (await setting.GET(req('/me/two-step', { bearer: plain.accessToken }), none)).json()).toEqual({ on: false });

    // turn it on through the API
    const started = await setting.POST(req('/me/two-step', { method: 'POST', bearer: plain.accessToken }), none);
    expect(started.status).toBe(201);
    const setup = (await started.json()) as { factorId: string; secret: string; qrCode: string };
    expect(setup.qrCode).toMatch(/^data:image\/svg\+xml/);
    const bad = await confirm.POST(req('/me/two-step/verify', { method: 'POST', bearer: plain.accessToken, body: { factorId: setup.factorId, code: 'abc' } }), none);
    expect(bad.status).toBe(422);
    const on = await withCode(
      setup.secret,
      async (code) => {
        const res = await confirm.POST(req('/me/two-step/verify', { method: 'POST', bearer: plain.accessToken, body: { factorId: setup.factorId, code } }), none);
        const json = (await res.json()) as Tokens & { on: boolean; error?: { code: string; detail?: string } };
        if (res.status === 422) throw new DataError(json.error!.code, json.error!.detail);
        expect(res.status).toBe(200);
        return json;
      },
      isWrongCode,
    );
    expect(on).toMatchObject({ on: true, twoStepRequired: false });
    // the old token only passed the password now
    const refused = await me.GET(req('/me', { bearer: plain.accessToken }), none);
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ error: { code: 'two_step_required' } });
    expect(await (await setting.GET(req('/me/two-step', { bearer: on.accessToken }), none)).json()).toEqual({ on: true });
    expect((await setting.POST(req('/me/two-step', { method: 'POST', bearer: on.accessToken }), none)).status).toBe(409);

    // signing in now takes two steps
    const half = (await (await token.POST(req('/auth/token', { method: 'POST', body: { email: api.email, password: api.password } }))).json()) as Tokens;
    expect(half.twoStepRequired).toBe(true);
    expect((await me.GET(req('/me', { bearer: half.accessToken }), none)).status).toBe(401);
    const wrong = await verify.POST(req('/auth/token/verify', { method: 'POST', bearer: half.accessToken, body: { code: wrongCode(setup.secret) } }));
    expect(wrong.status).toBe(422);
    expect(await wrong.json()).toMatchObject({ error: { code: 'invalid_input', detail: 'code' } });
    expect((await verify.POST(req('/auth/token/verify', { method: 'POST', body: { code: '123456' } }))).status).toBe(401);
    const whole = await withCode(
      setup.secret,
      async (code) => {
        const res = await verify.POST(req('/auth/token/verify', { method: 'POST', bearer: half.accessToken, body: { code } }));
        const json = (await res.json()) as Tokens & { error?: { code: string; detail?: string } };
        if (res.status === 422) throw new DataError(json.error!.code, json.error!.detail);
        expect(res.status).toBe(200);
        return json;
      },
      isWrongCode,
    );
    expect(whole.twoStepRequired).toBe(false);
    expect((await me.GET(req('/me', { bearer: whole.accessToken }), none)).status).toBe(200);

    // off again, with the password
    const noPassword = await setting.DELETE(req('/me/two-step', { method: 'DELETE', bearer: whole.accessToken, body: { currentPassword: 'nope' } }), none);
    expect(noPassword.status).toBe(422);
    const off = await setting.DELETE(req('/me/two-step', { method: 'DELETE', bearer: whole.accessToken, body: { currentPassword: api.password } }), none);
    expect(await off.json()).toEqual({ on: false });
    // and the password is enough again, even for the token it refused
    expect((await me.GET(req('/me', { bearer: half.accessToken }), none)).status).toBe(200);
  });

  it('turns off, and the password is enough again', async () => {
    const session = await withCode(secret, async (code) => verifySecondStep(await passwordToken(web), code), isWrongCode);
    await turnOffTwoStep(session.access_token);
    expect(await twoStepOn(session.access_token)).toBe(false);
    expect(await catalogRead(await passwordToken(web))).toBeNull();
    // off already is fine
    await turnOffTwoStep(session.access_token);
  });
});
