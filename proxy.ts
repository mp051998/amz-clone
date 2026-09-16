import { NextResponse, type NextRequest } from 'next/server';

/**
 * India store lives under the /in path prefix (stands in for amazon.in vs amazon.com,
 * since we can't register real domains for the demo). Rewrite /in/* onto the existing
 * routes and stamp `x-amz-country: IN` so one set of pages serves both stores.
 *
 * Next 16 renamed the `middleware` file convention to `proxy` (same NextRequest/NextResponse API).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/in' || pathname.startsWith('/in/')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || '/'; // /in/product/x → /product/x, /in → /
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-amz-country', 'IN');
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  return NextResponse.next();
}

// Skip Next internals and static assets (incl. /products/* product images).
export const config = {
  matcher: ['/((?!_next/static|_next/image|products/|favicon.ico|.*\\.).*)'],
};
