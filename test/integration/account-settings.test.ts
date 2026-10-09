import { afterAll, describe, expect, it } from 'vitest';
import { changeEmail, changePassword, checkPassword, createAccount, isRecovery, renameAccount, RECOVERY_WINDOW_S, signOutElsewhere } from '@/lib/data/account';
import { DataError } from '@/lib/data/errors';
import { admin, anon } from './helpers';

const made: string[] = [];
afterAll(async () => {
  await Promise.all(made.map((id) => admin().auth.admin.deleteUser(id)));
});

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

const email = () => `acct-${crypto.randomUUID().slice(0, 12)}@example.test`;

async function account(name = 'Rosa Parks') {
  const e = email();
  const password = `pw-${crypto.randomUUID()}`;
  const { id } = await createAccount(admin(), { email: e, password, name });
  made.push(id);
  const db = anon();
  const { data, error } = await db.auth.signInWithPassword({ email: e, password });
  if (error) throw error;
  return { id, email: e, password, db, session: data.session! };
}

describe('account settings', () => {
  it('creates accounts that can sign in straight away, with their name on the profile', async () => {
    const me = await account('Rosa Parks');
    const { data } = await me.db.from('profiles').select('display_name').eq('id', me.id).single();
    expect(data?.display_name).toBe('Rosa Parks');
    expect(await failure(createAccount(admin(), { email: me.email.toUpperCase(), password: 'another-pw', name: 'X' }))).toBe('duplicate:email');
    expect(await failure(createAccount(admin(), { email: email(), password: '123', name: 'X' }))).toBe('invalid_input:password');
    expect(await failure(createAccount(admin(), { email: 'not-an-email', password: 'secret-123', name: 'X' }))).toBe('invalid_input:email');
  });

  it('renames the account and the profile', async () => {
    const me = await account();
    expect(await renameAccount(admin(), me.db, me.id, '  Rosa   Louise  Parks ')).toBe('Rosa Louise Parks');
    const [{ data: profile }, { data: user }] = await Promise.all([
      me.db.from('profiles').select('display_name').eq('id', me.id).single(),
      admin().auth.admin.getUserById(me.id),
    ]);
    expect(profile?.display_name).toBe('Rosa Louise Parks');
    expect(user.user?.user_metadata.full_name).toBe('Rosa Louise Parks');
    expect(await failure(renameAccount(admin(), me.db, me.id, '   '))).toBe('invalid_input:name');
    expect(await failure(renameAccount(admin(), me.db, me.id, 'x'.repeat(81)))).toBe('invalid_input:name');
  });

  it('changes the email only with the current password, and not to a taken one', async () => {
    const me = await account();
    const other = await account();
    const next = email();
    expect(await failure(changeEmail(admin(), me, { email: next, currentPassword: 'wrong' }))).toBe('invalid_input:currentPassword');
    expect(await failure(changeEmail(admin(), me, { email: other.email, currentPassword: me.password }))).toBe('duplicate:email');
    expect(await changeEmail(admin(), me, { email: ` ${next.toUpperCase()} `, currentPassword: me.password })).toBe(next);
    expect(await checkPassword(next, me.password)).toBe(true);
    expect(await checkPassword(me.email, me.password)).toBe(false);
  });

  it('changes the password with the current one, ends every old session, returns a new one', async () => {
    const me = await account();
    const elsewhere = anon();
    await elsewhere.auth.signInWithPassword({ email: me.email, password: me.password });

    const input = { newPassword: 'brand-new-pw', accessToken: me.session.access_token, recovering: false };
    expect(await failure(changePassword(admin(), me, { ...input, currentPassword: 'wrong' }))).toBe('invalid_input:currentPassword');
    expect(await failure(changePassword(admin(), me, { ...input, newPassword: '12345', currentPassword: me.password }))).toBe('invalid_input:password');
    const fresh = await changePassword(admin(), me, { ...input, currentPassword: me.password });

    expect(await checkPassword(me.email, 'brand-new-pw')).toBe(true);
    expect(await checkPassword(me.email, me.password)).toBe(false);
    expect((await elsewhere.auth.refreshSession()).error).not.toBeNull();
    expect((await me.db.auth.refreshSession()).error).not.toBeNull();
    // the caller carries on with the session it got back
    const again = anon();
    expect((await again.auth.setSession({ access_token: fresh.access_token, refresh_token: fresh.refresh_token })).error).toBeNull();
    expect((await again.auth.refreshSession()).error).toBeNull();
  });

  it('after a reset link, sets the password without the old one', async () => {
    const me = await account();
    await changePassword(admin(), me, { newPassword: 'reset-pw-1', accessToken: me.session.access_token, recovering: true });
    expect(await checkPassword(me.email, 'reset-pw-1')).toBe(true);
  });

  it('counts a session as recovering only from an emailed link, for a short while', async () => {
    const now = 1_800_000_000;
    expect(isRecovery({ amr: [{ method: 'otp', timestamp: now - 60 }] }, now)).toBe(true);
    expect(isRecovery({ amr: [{ method: 'recovery', timestamp: now - RECOVERY_WINDOW_S }] }, now)).toBe(true);
    expect(isRecovery({ amr: [{ method: 'otp', timestamp: now - RECOVERY_WINDOW_S - 1 }] }, now)).toBe(false);
    expect(isRecovery({ amr: [{ method: 'password', timestamp: now }] }, now)).toBe(false);
    expect(isRecovery({ amr: 'otp' }, now)).toBe(false);
    expect(isRecovery(null, now)).toBe(false);

    // a real reset link opens an `otp` session
    const me = await account();
    const { data: link } = await admin().auth.admin.generateLink({ type: 'recovery', email: me.email });
    const { data } = await anon().auth.verifyOtp({ token_hash: link.properties!.hashed_token, type: 'recovery' });
    const claims = JSON.parse(Buffer.from(data.session!.access_token.split('.')[1], 'base64url').toString());
    expect(isRecovery(claims)).toBe(true);
    expect(isRecovery(JSON.parse(Buffer.from(me.session.access_token.split('.')[1], 'base64url').toString()))).toBe(false);
  });
});

describe('sign out everywhere', () => {
  it('ends every other session of the account, and only that account’s, keeping the caller’s', async () => {
    const [me, someone] = await Promise.all([account(), account('Someone Else')]);
    const elsewhere = anon();
    await elsewhere.auth.signInWithPassword({ email: me.email, password: me.password });
    expect((await elsewhere.auth.getUser()).data.user?.id).toBe(me.id);

    await signOutElsewhere(admin(), me.session.access_token);

    expect((await elsewhere.auth.getUser()).error).not.toBeNull();
    expect((await elsewhere.auth.refreshSession()).error).not.toBeNull();
    // the caller carries on, and the account still signs in
    expect((await me.db.auth.getUser()).data.user?.id).toBe(me.id);
    expect((await me.db.auth.refreshSession()).error).toBeNull();
    expect((await anon().auth.signInWithPassword({ email: me.email, password: me.password })).error).toBeNull();
    // another account's sessions are untouched
    expect((await someone.db.auth.refreshSession()).error).toBeNull();
  });
});
