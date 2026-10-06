import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ error: null as unknown, calls: [] as string[] }));

vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock('@/lib/supabase/server', () => ({
  db: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: state.error }),
      verifyOtp: async () => ({ error: state.error }),
    },
  }),
}));
vi.mock('@/lib/guest-cart', () => ({ adoptGuestCart: async () => void state.calls.push('adopt') }));

const { GET } = await import('./route');

const open = (qs: string) => GET(new NextRequest(`http://localhost/auth/confirm?${qs}`));

beforeEach(() => {
  state.error = null;
  state.calls = [];
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
