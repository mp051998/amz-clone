import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/supabase/server';
import { adoptGuestCart } from '@/lib/guest-cart';
import { safeNext } from '@/lib/safe-next';

/**
 * GET /auth/confirm — where emailed links (password reset) land. Supabase sends either a
 * one-time `code` (PKCE: the browser that asked for the link holds the verifier cookie) or a
 * `token_hash` + `type`. Either opens a session, takes over the guest cart like a password
 * sign-in does, then we continue to `next`.
 */
export async function GET(req: NextRequest): Promise<never> {
  const q = req.nextUrl.searchParams;
  const next = safeNext(q.get('next'));
  const code = q.get('code');
  const tokenHash = q.get('token_hash');
  const type = q.get('type') as EmailOtpType | null;

  const supabase = await db();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: q.get('error_code') ?? 'missing' };
  if (!error) {
    await adoptGuestCart();
    redirect(next);
  }

  // expired, already used, or opened in another browser than the one that asked for it
  const signin = next === '/in' || next.startsWith('/in/') ? '/in/signin/forgot' : '/signin/forgot';
  redirect(`${signin}?error=link`);
}
