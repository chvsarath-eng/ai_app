'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen } from 'lucide-react'

import { SignInCard } from '@/components/auth/sign-in-card'
import { Card } from '@/components/ui/card'
import { useAuthStore } from '@/lib/auth-store'

const REASONS: Record<string, string> = {
  projects: 'Sign in to see your books.',
  admin: 'Admin access requires sign-in.',
  checkout: 'Sign in to place your order.'
}

export function LoginClient ({ next, reason }: { next: string; reason?: string }) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (user) {
      router.replace(next)
      router.refresh()
    }
  }, [next, router, user])

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center py-10">
      <Card className="w-full p-6 sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white">
            <BookOpen className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to see your books and orders.</p>
        </div>
        <SignInCard reason={reason ? REASONS[reason] ?? null : null} />
      </Card>
    </div>
  )
}
