'use client'

import { useCallback } from 'react'
import { Sparkles } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SignInCard } from '@/components/auth/sign-in-card'
import { useAuthStore, type AuthUser } from '@/lib/auth-store'

/**
 * Global sign-in dialog. Open it from anywhere with `useAuthStore().openSignIn(reason)`.
 * The `onSignedIn` continuation is resolved by callers observing `user` in the store.
 */
export function SignInDialog () {
  const isOpen = useAuthStore((s) => s.isSignInOpen)
  const reason = useAuthStore((s) => s.signInReason)
  const closeSignIn = useAuthStore((s) => s.closeSignIn)
  const setUser = useAuthStore((s) => s.setUser)

  const handleSignedIn = useCallback((user: AuthUser | null) => {
    if (user) setUser(user)
    closeSignIn()
  }, [closeSignIn, setUser])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeSignIn() }}>
      <DialogContent className="max-w-md p-6 sm:p-7">
        <DialogHeader className="mb-4 pr-10">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 text-white shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle>Save your book to your account</DialogTitle>
          <DialogDescription>
            Sign in so you can watch your book being made, download it anytime, and find it later under My Books.
          </DialogDescription>
        </DialogHeader>
        <SignInCard reason={reason} onSignedIn={handleSignedIn} compact />
      </DialogContent>
    </Dialog>
  )
}
