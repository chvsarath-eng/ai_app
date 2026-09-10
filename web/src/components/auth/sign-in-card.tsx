'use client'

import { useCallback, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore, type AuthUser } from '@/lib/auth-store'
import { registerWithEmail, resetPassword, signInWithEmail, signInWithGoogle } from '@/lib/firebase/client'
import { trackEvent } from '@/lib/analytics'

type Mode = 'google' | 'email' | 'register' | 'reset'

function friendlyAuthError (err: unknown): string {
  const code = (err as { code?: string })?.code || ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was closed before finishing. Please try again.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    case 'auth/invalid-email':
      return 'That email address does not look right.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account already exists with this email. Try signing in instead.'
    case 'auth/weak-password':
      return 'Please choose a password with at least 6 characters.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for sign-in yet. Add it in Firebase Auth settings.'
    default:
      return err instanceof Error ? err.message : 'Sign-in failed. Please try again.'
  }
}

function GoogleIcon () {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4-13.6-9.7l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

export function SignInCard ({
  reason,
  onSignedIn,
  compact = false
}: {
  reason?: string | null
  onSignedIn?: (user: AuthUser | null) => void
  compact?: boolean
}) {
  const isConfigured = useAuthStore((s) => s.isConfigured)
  const authMode = useAuthStore((s) => s.authMode)
  const [mode, setMode] = useState<Mode>('google')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const handleLocalSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault()
    setIsBusy(true)
    setError(null)
    try {
      trackEvent('sign_in_start', { method: 'local' })
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.user) {
        throw new Error(data?.error || 'Sign-in failed. Please try again.')
      }
      trackEvent('sign_in_success', { method: 'local' })
      onSignedIn?.(data.user as AuthUser)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
    } finally {
      setIsBusy(false)
    }
  }, [email, name, onSignedIn])

  const handleGoogle = useCallback(async () => {
    setIsBusy(true)
    setError(null)
    try {
      trackEvent('sign_in_start', { method: 'google' })
      const user = await signInWithGoogle()
      if (user) {
        trackEvent('sign_in_success', { method: 'google' })
        onSignedIn?.({
          uid: user.uid,
          email: user.email,
          name: user.displayName,
          picture: user.photoURL,
          isAdmin: false
        })
      }
      // Redirect flow: the page will reload; AuthProvider completes the session.
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setIsBusy(false)
    }
  }, [onSignedIn])

  const handleEmailSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault()
    setIsBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'reset') {
        await resetPassword(email.trim())
        setNotice('Password reset email sent. Check your inbox.')
        return
      }
      const user = mode === 'register'
        ? await registerWithEmail(email.trim(), password)
        : await signInWithEmail(email.trim(), password)
      trackEvent('sign_in_success', { method: mode === 'register' ? 'email_register' : 'email' })
      onSignedIn?.({
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        picture: user.photoURL,
        isAdmin: false
      })
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setIsBusy(false)
    }
  }, [email, mode, onSignedIn, password])

  if (!isConfigured) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Sign-in is not configured yet. Set the <code>NEXT_PUBLIC_FIREBASE_*</code> environment variables.
      </div>
    )
  }

  if (authMode === 'local') {
    return (
      <div className={compact ? 'space-y-4' : 'space-y-5'}>
        {reason && (
          <p className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-sm text-violet-800">{reason}</p>
        )}

        <Button
          type="button"
          disabled
          title="Google sign-in activates once Firebase Auth is connected"
          className="h-11 w-full justify-center gap-2 bg-zinc-900 text-white opacity-60"
        >
          <GoogleIcon />
          Continue with Google
        </Button>
        <p className="-mt-2 text-center text-[11px] text-zinc-400">
          Google sign-in turns on automatically when Firebase Auth is connected.
        </p>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200" />
          local dev sign-in
          <span className="h-px flex-1 bg-zinc-200" />
        </div>

        <form onSubmit={handleLocalSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="authEmail">Email</Label>
            <Input
              id="authEmail"
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={isBusy}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="authName">Name</Label>
            <Input
              id="authName"
              type="text"
              autoComplete="name"
              value={name}
              disabled={isBusy}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <Button type="submit" disabled={isBusy} className="h-11 w-full font-semibold">
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Continue
          </Button>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <p className="text-center text-[11px] leading-relaxed text-zinc-400">
          By continuing you agree to our{' '}
          <a href="/terms" className="underline" target="_blank" rel="noreferrer">Terms</a> and{' '}
          <a href="/privacy" className="underline" target="_blank" rel="noreferrer">Privacy Policy</a>.
        </p>
      </div>
    )
  }

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {reason && (
        <p className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-sm text-violet-800">{reason}</p>
      )}

      <Button
        type="button"
        onClick={handleGoogle}
        disabled={isBusy}
        className="h-11 w-full justify-center gap-2 bg-zinc-900 text-white hover:bg-zinc-800"
      >
        {isBusy && mode === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        or
        <span className="h-px flex-1 bg-zinc-200" />
      </div>

      {mode === 'google' ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setMode('email')}
          className="h-11 w-full justify-center gap-2"
        >
          <Mail className="h-4 w-4" />
          Continue with email
        </Button>
      ) : (
        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="authEmail">Email</Label>
            <Input
              id="authEmail"
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={isBusy}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {mode !== 'reset' && (
            <div className="space-y-1.5">
              <Label htmlFor="authPassword">Password</Label>
              <Input
                id="authPassword"
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                disabled={isBusy}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
          )}
          <Button type="submit" disabled={isBusy} className="h-11 w-full font-semibold">
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            {mode === 'email' && (
              <>
                <button type="button" className="underline" onClick={() => setMode('register')}>Create an account</button>
                <button type="button" className="underline" onClick={() => setMode('reset')}>Forgot password?</button>
              </>
            )}
            {mode !== 'email' && (
              <button type="button" className="underline" onClick={() => setMode('email')}>Back to sign in</button>
            )}
          </div>
        </form>
      )}

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-center text-[11px] leading-relaxed text-zinc-400">
        By continuing you agree to our{' '}
        <a href="/terms" className="underline" target="_blank" rel="noreferrer">Terms</a> and{' '}
        <a href="/privacy" className="underline" target="_blank" rel="noreferrer">Privacy Policy</a>.
      </p>
    </div>
  )
}
