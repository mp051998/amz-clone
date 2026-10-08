import { NextResponse, type NextRequest } from 'next/server';
import { refreshSession } from './lib/supabase/proxy-session';
import { allowedBeforeSecondStep, VERIFY_PATH } from './lib/two-step';

/**
 * India store lives under the /in path prefix (stands in for a separate regional
 * domain). Rewrite /in/* onto the existing routes and stamp `x-amz-country: IN`
 * so one set of pages serves both stores. `x-amz-path` carries the in-store path being viewed
 * (query included) so sign-in links can bring the shopper back to it.
 *
 * Also refreshes the Supabase auth session so logins persist across navigation, and keeps a
 * session that still owes its second step (two-step verification) on the code page.
 *
 * Next 16 renamed the `middleware` file convention to `proxy` (same NextRequest/NextResponse API).
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // refresh first so the rotated cookies ride along on the forwarded request
  const { rotated, owesSecondStep } = await refreshSession(req);
  const requestHeaders = new Headers(req.headers);

  let res: NextResponse;
  if (owesSecondStep && !allowedBeforeSecondStep(pathname)) {
    const india = pathname === '/in' || pathname.startsWith('/in/');
    const url = req.nextUrl.clone();
    url.pathname = india ? `/in${VERIFY_PATH}` : VERIFY_PATH;
    url.search = `?${new URLSearchParams({ next: pathname + req.nextUrl.search })}`;
    res = NextResponse.redirect(url);
  } else if (pathname === '/in' || pathname.startsWith('/in/')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || '/'; // /in/product/x → /product/x, /in → /
    requestHeaders.set('x-amz-country', 'IN');
    requestHeaders.set('x-amz-path', url.pathname + url.search);
    res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    // never trust a client-sent store header
    requestHeaders.delete('x-amz-country');
    requestHeaders.set('x-amz-path', pathname + req.nextUrl.search);
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }

  rotated.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
  return res;
}

// Skip Next internals and static assets (incl. /products/* product images).
export const config = {
  matcher: ['/((?!_next/static|_next/image|products/|favicon.ico|.*\\.).*)'],
};
