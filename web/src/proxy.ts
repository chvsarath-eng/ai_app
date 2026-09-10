import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE_NAME = 'img2x_session'

/**
 * Optimistic route protection (Next.js 16 `proxy`). Only checks that a session cookie
 * exists; server components / API routes verify it cryptographically with firebase-admin.
 *
 * Everything else (home, create flow, checkout) stays guest-accessible by design.
 */
export function proxy (request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value)

  if (hasSession) return NextResponse.next()

  const reason = pathname.startsWith('/admin') ? 'admin' : 'projects'
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  loginUrl.searchParams.set('next', pathname + search)
  loginUrl.searchParams.set('reason', reason)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/projects/:path*', '/account/:path*', '/admin/:path*']
}
