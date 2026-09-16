import { cookies } from 'next/headers';

export const USER_COOKIE = 'amz_user';

export interface SessionUser {
  name: string;
  email: string;
}

/** derive a display name from an email local-part (e.g. alex.morgan@x.com → Alex Morgan). */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || 'there';
  const words = local.split(/[._-]+/).filter(Boolean);
  const titled = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return titled || 'there';
}

export async function readUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.email === 'string' && typeof obj.name === 'string') return obj as SessionUser;
    return null;
  } catch {
    return null;
  }
}

export function firstName(user: SessionUser): string {
  return user.name.split(' ')[0] || user.name;
}
