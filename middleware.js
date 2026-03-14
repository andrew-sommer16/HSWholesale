import { NextResponse } from 'next/server';

export function middleware(request) {
  const token = request.cookies.get('sb-token')?.value;
  const { pathname } = request.nextUrl;

  // Allow auth routes, sync routes, and public assets through
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/app-auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/load') ||
    pathname.startsWith('/api/uninstall') ||
    pathname.startsWith('/api/sync') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    const response = NextResponse.next();
    response.headers.delete('X-Frame-Options');
    response.headers.set('Content-Security-Policy', 'frame-ancestors *');
    return response;
  }

  // Redirect to login if no token
  if (!token) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.headers.delete('X-Frame-Options');
    response.headers.set('Content-Security-Policy', 'frame-ancestors *');
    return response;
  }

  const response = NextResponse.next();
  response.headers.delete('X-Frame-Options');
  response.headers.set('Content-Security-Policy', 'frame-ancestors *');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};