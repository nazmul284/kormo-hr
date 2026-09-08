import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route guard.
 *
 * Checks only for the *presence* of the refresh cookie — it deliberately
 * does not try to validate it. Cheap edge redirects keep signed-out users
 * off app routes; the API is the actual authorisation boundary, and it
 * re-verifies every request.
 */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has('kormo_rt') || request.cookies.has('kormo_at');
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve where they were heading so login can return them there.
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (hasSession && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except static assets, the API proxy, and image files.
    '/((?!api|_next/static|_next/image|favicon|icon-|apple-touch-icon|logo-|manifest).*)',
  ],
};
