import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ error: null as unknown, calls: [] as string[], data: null as unknown }));

vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock('@/lib/supabase/server', () => ({
  db: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ data: state.data, error: state.error }),
      verifyOtp: async () => ({ data: state.data, error: state.error }),
    },
  }),
}));
vi.mock('@/lib/guest-cart', () => ({ adoptGuestCart: async () => void state.calls.push('adopt') }));

const { GET } = await import('./route');

const open = (qs: string) => GET(new NextRequest(`http://localhost/auth/confirm?${qs}`));

beforeEach(() => {
  state.error = null;
  state.calls = [];
  state.data = null;
});

it('a reset link that opens a session takes over the guest cart', async () => {
  await expect(open('code=abc&next=%2Faccount%2Fsecurity')).rejects.toThrow('REDIRECT /account/security');
  await expect(open('token_hash=t&type=recovery&next=%2Fin%2Faccount%2Fsecurity')).rejects.toThrow('REDIRECT /in/account/security');
  expect(state.calls).toEqual(['adopt', 'adopt']);
});

it('a dead link leaves the guest cart alone', async () => {
  state.error = { code: 'otp_expired' };
  await expect(open('code=abc&next=%2Fin%2Faccount')).rejects.toThrow('REDIRECT /in/signin/forgot?error=link');
  await expect(open('next=%2Faccount')).rejects.toThrow('REDIRECT /signin/forgot?error=link');
  expect(state.calls).toEqual([]);
});

it('with two-step verification on, a reset link goes to the code page first, cart and all', async () => {
  const token = (aal: string) => `h.${Buffer.from(JSON.stringify({ aal })).toString('base64url')}.s`;
  state.data = { user: { factors: [{ id: 'f1', status: 'verified' }] }, session: { access_token: token('aal1') } };
  await expect(open('code=abc&next=%2Faccount%2Fsecurity')).rejects.toThrow('REDIRECT /signin/verify?next=%2Faccount%2Fsecurity');
  await expect(open('token_hash=t&type=recovery&next=%2Fin%2Faccount%2Fsecurity')).rejects.toThrow('REDIRECT /in/signin/verify?next=%2Fin%2Faccount%2Fsecurity');
  expect(state.calls).toEqual([]);
  // a factor still being set up doesn't count
  state.data = { user: { factors: [{ id: 'f1', status: 'unverified' }] }, session: { access_token: token('aal1') } };
  await expect(open('code=abc&next=%2Faccount')).rejects.toThrow('REDIRECT /account');
  expect(state.calls).toEqual(['adopt']);
});
