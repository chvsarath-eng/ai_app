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

function Avatar ({
  name,
  email,
  picture,
  size = 'sm'
}: {
  name: string | null
  email: string | null
  picture: string | null
  size?: 'sm' | 'md'
}) {
  return (
    <span
      className={
        size === 'md'
          ? 'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 text-xs font-bold text-white'
          : 'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 text-[11px] font-bold text-white ring-2 ring-white shadow-sm'
      }
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials(name, email)
      )}
    </span>
  )
}

async function signOutAndRefresh (
  setUser: (user: null) => void,
  router: ReturnType<typeof useRouter>,
  onDone?: () => void
) {
  try {
    await signOutUser()
  } finally {
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
    setUser(null)
    onDone?.()
    router.push('/')
    router.refresh()
  }
}

export function AccountPanel ({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const isConfigured = useAuthStore((s) => s.isConfigured)
  const openSignIn = useAuthStore((s) => s.openSignIn)
  const setUser = useAuthStore((s) => s.setUser)

  if (!isConfigured) return null

  if (!user) {
    return (
      <Button
        className="h-10 w-full text-sm font-semibold"
        disabled={isLoading}
        onClick={() => {
          onNavigate?.()
          openSignIn()
        }}
      >
        Sign in
      </Button>
    )
  }

  const itemClass = 'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100'

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-3">
        <Avatar name={user.name} email={user.email} picture={user.picture} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900">{user.name || 'Your account'}</p>
          <p className="truncate text-xs text-zinc-500">{user.email}</p>
        </div>
      </div>
      <Link href="/projects" onClick={onNavigate} className={itemClass}>
        <BookOpen className="h-4 w-4 text-violet-600" /> My Storybooks
      </Link>
      <Link href="/account" onClick={onNavigate} className={itemClass}>
        <UserRound className="h-4 w-4 text-zinc-500" /> Account
      </Link>
      {user.isAdmin && (
        <Link href="/admin" onClick={onNavigate} className={itemClass}>
          <ShieldCheck className="h-4 w-4 text-emerald-600" /> Admin
        </Link>
      )}
      <button
        type="button"
        onClick={() => void signOutAndRefresh(setUser, router, onNavigate)}
        className={`${itemClass} w-full text-left`}
      >
        <LogOut className="h-4 w-4 text-zinc-500" /> Sign out
      </button>
    </div>
  )
}

export function UserMenu ({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const isConfigured = useAuthStore((s) => s.isConfigured)
  const openSignIn = useAuthStore((s) => s.openSignIn)
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
        onClick={() => {
          onNavigate?.()
          openSignIn()
        }}
      >
        Sign in
      </Button>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open account menu"
        className="transition hover:opacity-90"
      >
        <Avatar name={user.name} email={user.email} picture={user.picture} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-zinc-200/80 bg-white p-2 text-sm shadow-xl"
        >
          <AccountPanel
            onNavigate={() => {
              setIsOpen(false)
              onNavigate?.()
            }}
          />
        </div>
      )}
    </div>
  )
}
