'use client'

import { useEffect } from 'react'
import type { User } from 'firebase/auth'

import { useAuthStore, type AuthUser } from '@/lib/auth-store'
import { completeRedirectSignIn, getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase/client'

async function exchangeForSession (firebaseUser: User): Promise<AuthUser | null> {
  const idToken = await firebaseUser.getIdToken()
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  })
  if (!res.ok) return null
  const data = await res.json()
  return (data?.user as AuthUser) ?? null
}

/**
 * Keeps the Zustand auth store in sync with Firebase Auth and mints/clears the
 * httpOnly session cookie used by server components and API routes.
 */
export function AuthProvider ({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser)
  const setLoading = useAuthStore((s) => s.setLoading)
  const setConfigured = useAuthStore((s) => s.setConfigured)
  const setAuthMode = useAuthStore((s) => s.setAuthMode)

  useEffect(() => {
    let isCancelled = false
    let unsubscribe = () => {}

    // Local dev auth: no Firebase SDK on the client, the server owns the session.
    if (!isFirebaseConfigured()) {
      setAuthMode('local')
      setConfigured(true)
      fetch('/api/auth/session', { cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) return
          const data = await res.json()
          if (isCancelled) return
          if (data?.authMode === 'firebase') {
            // Server expects Firebase but the client keys are missing: nothing can sign in.
            setConfigured(false)
          }
          if (data?.user) setUser(data.user as AuthUser)
        })
        .catch(() => {})
        .finally(() => { if (!isCancelled) setLoading(false) })
      return () => { isCancelled = true }
    }

    setAuthMode('firebase')

    const safety = setTimeout(() => {
      if (!isCancelled) setLoading(false)
    }, 6000)

    async function bootstrap () {
      // Seed from the server cookie first (fast path, no flash of signed-out UI).
      try {
        const controller = new AbortController()
        const abort = setTimeout(() => controller.abort(), 4000)
        const res = await fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal })
        clearTimeout(abort)
        if (res.ok) {
          const data = await res.json()
          if (!isCancelled && data?.user) setUser(data.user as AuthUser)
        }
      } catch {
        // ignore
      } finally {
        if (!isCancelled) setLoading(false)
      }

      try {
        await completeRedirectSignIn()
      } catch (err) {
        console.warn('Redirect sign-in check failed:', err)
      }

      const { onIdTokenChanged } = await import('firebase/auth')
      unsubscribe = onIdTokenChanged(getFirebaseAuth(), async (firebaseUser) => {
        if (isCancelled) return
        if (!firebaseUser) {
          const current = useAuthStore.getState().user
          // Only clear if Firebase explicitly reports signed-out after we had a client user;
          // a server cookie may still be valid when the client SDK has not hydrated yet.
          if (current) {
            await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
            setUser(null)
          }
          setLoading(false)
          return
        }
        try {
          const sessionUser = await exchangeForSession(firebaseUser)
          if (sessionUser) {
            setUser(sessionUser)
          } else {
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: firebaseUser.displayName,
              picture: firebaseUser.photoURL,
              isAdmin: false
            })
          }
        } catch (err) {
          console.error('Session exchange failed:', err)
        } finally {
          setLoading(false)
        }
      })
    }

    void bootstrap()

    return () => {
      isCancelled = true
      clearTimeout(safety)
      unsubscribe()
    }
  }, [setAuthMode, setConfigured, setLoading, setUser])

  return <>{children}</>
}
