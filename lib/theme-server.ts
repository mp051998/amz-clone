import 'server-only';
import { cookies } from 'next/headers';
import { THEME_COOKIE, themeFrom, type Theme } from './theme';

/** The visitor's theme from the request cookie. */
export async function readTheme(): Promise<Theme> {
  return themeFrom((await cookies()).get(THEME_COOKIE)?.value);
}
