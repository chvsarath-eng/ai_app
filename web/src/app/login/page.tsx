import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/lib/session'
import { LoginClient } from './login-client'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false }
}

export const dynamic = 'force-dynamic'

function safeNext (value: string | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/projects'
  return value
}

export default async function LoginPage ({
  searchParams
}: {
  searchParams: Promise<{ next?: string; reason?: string }>
}) {
  const params = await searchParams
  const next = safeNext(params.next)
  const user = await getSessionUser()
  if (user) redirect(next)

  return <LoginClient next={next} reason={params.reason} />
}
