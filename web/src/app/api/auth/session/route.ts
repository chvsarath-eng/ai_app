import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { setDocument } from '@/lib/data-store'
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createLocalSessionToken,
  getAuthMode,
  getSessionUser,
  isAdminEmail,
  isLocalAuth,
  localUidForEmail,
  type SessionUser
} from '@/lib/session'

export const runtime = 'nodejs'

function cookieOptions () {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS
  }
}

async function upsertUserProfile (user: SessionUser, provider: string | null) {
  try {
    await setDocument('users', user.uid, {
      uid: user.uid,
      email: user.email,
      displayName: user.name,
      photoURL: user.picture,
      provider,
      isAdmin: user.isAdmin,
      lastLoginAt: Date.now()
    })
  } catch (err) {
    console.warn('User profile upsert failed:', err)
  }
}

/** GET: return the current session user (or null) plus the active auth mode. */
export async function GET () {
  const user = await getSessionUser()
  return NextResponse.json({ user, authMode: getAuthMode() })
}

/**
 * POST { idToken }            -> Firebase: exchange an ID token for an httpOnly session cookie.
 * POST { email, name? }       -> Local dev auth (only when Firebase is not configured).
 */
export async function POST (request: Request) {
  let body: { idToken?: unknown; email?: unknown; name?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const idToken = typeof body.idToken === 'string' ? body.idToken : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  // ---- Local dev sign-in ---------------------------------------------------
  if (!idToken && email) {
    if (!isLocalAuth()) {
      return NextResponse.json({ error: 'Email sign-in requires Firebase. Use idToken.' }, { status: 400 })
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    }
    const user: SessionUser = {
      uid: localUidForEmail(email),
      email,
      name: name || email.split('@')[0],
      picture: null,
      isAdmin: isAdminEmail(email)
    }
    const token = createLocalSessionToken(user)
    const store = await cookies()
    store.set(SESSION_COOKIE_NAME, token, cookieOptions())
    await upsertUserProfile(user, 'local')
    return NextResponse.json({ user, authMode: 'local' })
  }

  if (!idToken) {
    return NextResponse.json({ error: 'idToken required' }, { status: 400 })
  }

  // ---- Firebase sign-in ----------------------------------------------------
  try {
    const { adminAuth } = await import('@/lib/firebase/admin')
    const auth = adminAuth()
    // checkRevoked=true: the token must be valid, unexpired and not revoked. We deliberately do
    // not require a *recent* auth_time: the Firebase client stays signed in for weeks while the
    // session cookie can expire or be cleared, and the client re-posts its (still valid) token
    // to re-establish the cookie. Rejecting that left users half signed-in (client yes, server no).
    const decoded = await auth.verifyIdToken(idToken, true)

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000
    })

    const store = await cookies()
    store.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions())

    const user: SessionUser = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: (decoded.name as string | undefined) ?? null,
      picture: (decoded.picture as string | undefined) ?? null,
      isAdmin: isAdminEmail(decoded.email ?? null)
    }
    await upsertUserProfile(user, decoded.firebase?.sign_in_provider ?? null)

    return NextResponse.json({ user, authMode: 'firebase' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create session'
    console.error('Session creation failed:', message)
    return NextResponse.json({ error: 'Invalid or expired sign-in token' }, { status: 401 })
  }
}

/** DELETE: clear the session cookie. */
export async function DELETE () {
  const store = await cookies()
  store.set(SESSION_COOKIE_NAME, '', { ...cookieOptions(), maxAge: 0 })
  return NextResponse.json({ ok: true })
}
