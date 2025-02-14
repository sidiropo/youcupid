import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Get the existing response
  const response = NextResponse.next();

  // Define CSP Header
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https:;
    font-src 'self' https://fonts.gstatic.com data:;
    img-src 'self' blob: data: https: http:;
    connect-src 'self' ws: wss: https: http: blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim();

  // Add CSP header
  response.headers.set('Content-Security-Policy', cspHeader);

  // Add other security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
}

// Only run middleware on specific paths
export const config = {
  matcher: '/:path*',
}; 