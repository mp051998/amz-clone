import { NextResponse, type NextRequest } from 'next/server';
import { refreshSession } from './lib/supabase/proxy-session';

/**
 * India store lives under the /in path prefix (stands in for a separate regional
 * domain). Rewrite /in/* onto the existing routes and stamp `x-amz-country: IN`
 * so one set of pages serves both stores.
 *
 * Also refreshes the Supabase auth session so logins persist across navigation.
 *
 * Next 16 renamed the `middleware` file convention to `proxy` (same NextRequest/NextResponse API).
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // refresh first so the rotated cookies ride along on the forwarded request
  const rotated = await refreshSession(req);
  const requestHeaders = new Headers(req.headers);

  let res: NextResponse;
  if (pathname === '/in' || pathname.startsWith('/in/')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || '/'; // /in/product/x → /product/x, /in → /
    requestHeaders.set('x-amz-country', 'IN');
    res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    // never trust a client-sent store header
    requestHeaders.delete('x-amz-country');
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }

  rotated.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
  return res;
}

// Skip Next internals and static assets (incl. /products/* product images).
export const config = {
  matcher: ['/((?!_next/static|_next/image|products/|favicon.ico|.*\\.).*)'],
};
