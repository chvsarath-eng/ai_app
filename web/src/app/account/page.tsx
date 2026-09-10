'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { User, BookOpen, LogOut, ShieldCheck, Mail, Sparkles, ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { useAuthStore } from '@/lib/auth-store'
import { signOutUser } from '@/lib/firebase/client'

export default function AccountPage () {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const openSignIn = useAuthStore((s) => s.openSignIn)
  const setUser = useAuthStore((s) => s.setUser)

  if (isAuthLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-pink-500" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white">
            <User className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800">Sign in to your account</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Access your profile, orders, and saved storybooks.
          </p>
          <Button
            className="mt-6 w-full font-semibold"
            onClick={() => openSignIn('Sign in to view your account')}
          >
            Sign in
          </Button>
        </Card>
      </div>
    )
  }

  const handleSignOut = async () => {
    try {
      await signOutUser()
    } finally {
      await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
      setUser(null)
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="py-10 sm:py-14">
      <PageHeader eyebrow="Account" title="Your account" subtitle="Profile, books, and quick links." className="mb-10" />

      <div className="mx-auto max-w-2xl">
        <Card className="space-y-6 p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-xl font-bold text-white shadow-md">
              {user.picture ? (
                <img src={user.picture} alt="" className="h-full w-full object-cover" />
              ) : (
                (user.name || user.email || 'U').slice(0, 2).toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900">{user.name || 'User Profile'}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                <Mail className="h-3.5 w-3.5 text-zinc-400" />
                {user.email}
              </p>
              {user.isAdmin && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                  <ShieldCheck className="h-3 w-3" /> Admin account
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t border-zinc-100 pt-6">
            <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-400">Quick links</h3>
            <Link
              href="/projects"
              className="flex items-center justify-between rounded-2xl border border-zinc-200/70 p-3.5 transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-violet-600" />
                <div>
                  <p className="text-sm font-semibold text-zinc-900">My Storybooks</p>
                  <p className="text-xs text-zinc-500">View and download your storybooks</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-400" />
            </Link>

            {user.isAdmin && (
              <Link
                href="/admin"
                className="flex items-center justify-between rounded-2xl border border-zinc-200/70 p-3.5 transition hover:border-emerald-200 hover:bg-emerald-50/40"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">Admin control panel</p>
                    <p className="text-xs text-zinc-500">Manage jobs, payments, and AI models</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-400" />
              </Link>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-zinc-100 pt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="gap-1.5 border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
            <Button asChild size="sm" className="text-xs font-semibold">
              <Link href="/create">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Create a storybook
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
