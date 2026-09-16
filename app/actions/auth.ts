'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { USER_COOKIE, nameFromEmail } from '@/lib/auth';

/** demo sign-in: any email + non-empty password works; no real accounts. */
export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim() || nameFromEmail(email);
  const next = String(formData.get('next') ?? '/');
  if (!email) redirect('/signin?error=1');

  (await cookies()).set(
    USER_COOKIE,
    JSON.stringify({ name, email }),
    { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 },
  );
  revalidatePath('/', 'layout');
  redirect(next.startsWith('/') ? next : '/');
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(USER_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/');
}
