import 'server-only'

import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import type { DecodedIdToken } from 'firebase-admin/auth'

export const SESSION_COOKIE_NAME = 'img2x_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5 // 5 days (Firebase max is 14)

const LOCAL_TOKEN_PREFIX = 'local.'

export type SessionUser = {
  uid: string
  email: string | null
  name: string | null
  picture: string | null
  isAdmin: boolean
}

export type AuthMode = 'firebase' | 'local'

/**
 * `firebase` when the Firebase web SDK is configured (NEXT_PUBLIC_FIREBASE_*),
 * otherwise `local` (HMAC-signed dev sessions). Override with AUTH_MODE.
 */
export function getAuthMode (): AuthMode {
  const explicit = (process.env.AUTH_MODE || process.env.NEXT_PUBLIC_AUTH_MODE || '').trim().toLowerCase()
  if (explicit === 'local' || explicit === 'firebase') return explicit
  return process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'firebase' : 'local'
}

export function isLocalAuth () {
  return getAuthMode() === 'local'
}

export function getAdminEmails (): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail (email: string | null | undefined): boolean {
  if (!email) return false
  return getAdminEmails().includes(email.toLowerCase())
}

function toSessionUser (decoded: DecodedIdToken): SessionUser {
  const email = decoded.email ?? null
  return {
    uid: decoded.uid,
    email,
    name: (decoded.name as string | undefined) ?? null,
    picture: (decoded.picture as string | undefined) ?? null,
    isAdmin: isAdminEmail(email)
  }
}

// ---------------------------------------------------------------------------
// Local (dev) sessions: base64url(payload).hmac
// ---------------------------------------------------------------------------

function sessionSecret () {
  const secret = process.env.SESSION_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production' && !isLocalAuth()) {
    throw new Error('SESSION_SECRET is required in production')
  }
  return 'img2x-local-dev-secret'
}

function sign (data: string) {
  return crypto.createHmac('sha256', sessionSecret()).update(data).digest('base64url')
}

export function localUidForEmail (email: string) {
  return `local_${crypto.createHash('sha1').update(email.toLowerCase()).digest('hex').slice(0, 20)}`
}

export function createLocalSessionToken (user: Omit<SessionUser, 'isAdmin'>): string {
  const payload = Buffer.from(JSON.stringify({
    uid: user.uid,
    email: user.email,
    name: user.name,
    picture: user.picture,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  })).toString('base64url')
  return `${LOCAL_TOKEN_PREFIX}${payload}.${sign(payload)}`
}

function verifyLocalSessionToken (token: string): SessionUser | null {
  const body = token.slice(LOCAL_TOKEN_PREFIX.length)
  const [payload, signature] = body.split('.')
  if (!payload || !signature) return null
  const expected = sign(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid: string; email: string | null; name: string | null; picture: string | null; exp: number
    }
    if (!data.uid || Date.now() > data.exp) return null
    return {
      uid: data.uid,
      email: data.email ?? null,
      name: data.name ?? null,
      picture: data.picture ?? null,
      isAdmin: isAdminEmail(data.email)
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------

export async function getSessionUser (): Promise<SessionUser | null> {
  const store = await cookies()
  const cookie = store.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null

  if (cookie.startsWith(LOCAL_TOKEN_PREFIX)) {
    return verifyLocalSessionToken(cookie)
  }

  try {
    const { adminAuth } = await import('@/lib/firebase/admin')
    const decoded = await adminAuth().verifySessionCookie(cookie, true)
    return toSessionUser(decoded)
  } catch {
    return null
  }
}

export class AuthError extends Error {
  status: number
  constructor (message: string, status = 401) {
    super(message)
    this.status = status
  }
}

export async function requireUser (): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AuthError('Sign in required', 401)
  return user
}

export async function requireAdmin (): Promise<SessionUser> {
  const user = await requireUser()
  if (!user.isAdmin) throw new AuthError('Admin access required', 403)
  return user
}

/** Verify a Bearer ID token (used by the session route and optional API clients). */
export async function verifyIdToken (idToken: string): Promise<SessionUser> {
  const { adminAuth } = await import('@/lib/firebase/admin')
  const decoded = await adminAuth().verifyIdToken(idToken, true)
  return toSessionUser(decoded)
}
