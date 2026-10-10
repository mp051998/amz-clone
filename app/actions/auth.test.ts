import { beforeEach, expect, it, vi } from 'vitest';
import { DataError } from '@/lib/data/errors';

const state = vi.hoisted(() => ({
  created: [] as unknown[],
  createError: null as unknown,
  signInError: null as unknown,
  signInUser: null as unknown,
  calls: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/session', () => ({ getMarket: async () => 'US' }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/guest-cart', () => ({ adoptGuestCart: async () => void state.calls.push('adopt') }));
vi.mock('@/lib/data/two-step', () => ({ verifySecondStep: async () => ({}) }));
vi.mock('@/lib/data/account', () => ({
  createAccount: async (_service: unknown, input: unknown) => {
    if (state.createError) throw state.createError;
    state.created.push(input);
    return { id: 'u1', email: 'ana@example.com' };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  db: async () => ({
    auth: {
      signInWithPassword: async () => {
        state.calls.push('signin');
        return { data: { user: state.signInUser, session: null }, error: state.signInError };
      },
    },
  }),
}));

const { signIn } = await import('./auth');

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const create = (extra: Record<string, string> = {}) =>
  signIn(form({ mode: 'create', email: 'Ana@Example.com', password: 'secret-1', name: 'Ana', next: '/cart', ...extra }));

beforeEach(() => {
  state.created = [];
  state.createError = null;
  state.signInError = null;
  state.signInUser = { id: 'u1', factors: [] };
  state.calls = [];
});

it('creates the account, signs in and continues to `next`', async () => {
  await expect(create()).rejects.toThrow('REDIRECT /cart');
  expect(state.created).toEqual([{ email: 'ana@example.com', password: 'secret-1', name: 'Ana' }]);
  expect(state.calls).toEqual(['signin', 'adopt']);
});

it('a taken email with the right password signs in to that account (Create account sent twice)', async () => {
  state.createError = new DataError('duplicate', 'email', 'An account already exists for that email.');
  await expect(create()).rejects.toThrow('REDIRECT /cart');
  expect(state.calls).toEqual(['signin', 'adopt']);
});

it('a taken email with a different password is refused as taken', async () => {
  state.createError = new DataError('duplicate', 'email', 'An account already exists for that email.');
  state.signInError = { code: 'invalid_credentials' };
  await expect(create()).rejects.toThrow('REDIRECT /signin?error=exists&next=%2Fcart&new=1');
  expect(state.calls).toEqual(['signin']);
});

it('a taken email whose account has two-step verification goes on to the code page', async () => {
  state.createError = new DataError('duplicate', 'email', 'An account already exists for that email.');
  state.signInUser = { id: 'u1', factors: [{ status: 'verified' }] };
  await expect(create()).rejects.toThrow('REDIRECT /signin/verify?next=%2Fcart');
  expect(state.calls).toEqual(['signin']);
});

it('an invalid sign-up goes back to the form without trying to sign in', async () => {
  state.createError = new DataError('invalid_input', 'password', 'Use at least 6 characters.');
  await expect(create()).rejects.toThrow('REDIRECT /signin?error=password&next=%2Fcart&new=1');
  expect(state.calls).toEqual([]);
});

it('a new account that then can’t sign in reports a sign-up failure', async () => {
  state.signInError = { code: 'unexpected_failure' };
  await expect(create()).rejects.toThrow('REDIRECT /signin?error=signup&next=%2Fcart&new=1');
});
