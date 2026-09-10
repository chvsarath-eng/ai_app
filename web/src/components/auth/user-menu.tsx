'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, LogOut, ShieldCheck, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/auth-store'
import { signOutUser } from '@/lib/firebase/client'

function initials (name: string | null, email: string | null) {
  const source = (name || email || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export function UserMenu ({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const isConfigured = useAuthStore((s) => s.isConfigured)
  const openSignIn = useAuthStore((s) => s.openSignIn)
  const setUser = useAuthStore((s) => s.setUser)
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function onClick (event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [isOpen])

  if (!isConfigured) return null

  if (!user) {
    return (
      <Button
        variant="outline"
        className="h-8 px-3 text-xs font-semibold"
        disabled={isLoading}
        onClick={() => { onNavigate?.(); openSignIn() }}
      >
        Sign in
      </Button>
    )
  }

  async function handleSignOut () {
    setIsOpen(false)
    try {
      await signOutUser()
    } finally {
      await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
      setUser(null)
      onNavigate?.()
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 text-[11px] font-bold text-white ring-2 ring-white shadow-sm transition hover:ring-violet-200"
      >
        {user.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initials(user.name, user.email)
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-zinc-200/80 bg-white p-2 text-sm shadow-xl"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-zinc-900">{user.name || 'Your account'}</p>
            <p className="truncate text-xs text-zinc-500">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-zinc-100" />
          <Link
            role="menuitem"
            href="/projects"
            onClick={() => { setIsOpen(false); onNavigate?.() }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-700 transition hover:bg-zinc-100"
          >
            <BookOpen className="h-4 w-4 text-violet-600" /> My Storybooks
          </Link>
          <Link
            role="menuitem"
            href="/account"
            onClick={() => { setIsOpen(false); onNavigate?.() }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-700 transition hover:bg-zinc-100"
          >
            <UserRound className="h-4 w-4 text-zinc-500" /> Account
          </Link>
          {user.isAdmin && (
            <Link
              role="menuitem"
              href="/admin"
              onClick={() => { setIsOpen(false); onNavigate?.() }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-700 transition hover:bg-zinc-100"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Admin
            </Link>
          )}
          <div className="my-1 h-px bg-zinc-100" />
          <button
            role="menuitem"
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-zinc-700 transition hover:bg-zinc-100"
          >
            <LogOut className="h-4 w-4 text-zinc-500" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
