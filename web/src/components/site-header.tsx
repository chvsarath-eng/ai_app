'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { UserMenu } from '@/components/auth/user-menu'
import { useAuthStore } from '@/lib/auth-store'

export function SiteHeader ({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const user = useAuthStore((s) => s.user)

  return (
    <header
      className={cn(
        'sticky top-[max(0.75rem,env(safe-area-inset-top))] z-50',
        className
      )}
    >
      <div className="w-full px-3 sm:px-4 lg:px-6">
        <div className="relative flex h-11 w-full items-center justify-between rounded-2xl bg-white/85 px-5 shadow-md ring-1 ring-zinc-200/70 backdrop-blur">
          <Link href="/" className="group inline-flex items-center leading-none">
            <span className="inline-flex items-center px-2 -translate-y-[1px]">
              <Image
                src="/brand/img2x-logo-transparent.png"
                alt="img2x"
                width={200}
                height={52}
                priority
                unoptimized
                style={{ width: 'auto' }}
                className="h-5.5 w-auto drop-shadow-[0_6px_14px_rgba(0,0,0,0.16)] sm:h-6"
              />
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-xs font-bold text-zinc-700 md:flex">
            <Link className="transition hover:text-zinc-950" href="/#gallery">Gallery</Link>
            <Link className="transition hover:text-zinc-950" href="/#pricing">Pricing</Link>
            <Link className="transition hover:text-zinc-950" href="/#reviews">Reviews</Link>
            {user && (
              <Link className="transition hover:text-zinc-950" href="/projects">My Storybooks</Link>
            )}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <UserMenu />
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <UserMenu onNavigate={() => setIsOpen(false)} />
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-700 transition hover:bg-zinc-100"
              aria-label="Toggle navigation menu"
              aria-expanded={isOpen}
              onClick={() => setIsOpen((prev) => !prev)}
            >
              <span className="flex h-4 w-4 flex-col items-center justify-between">
                <span className="h-0.5 w-full rounded bg-current" />
                <span className="h-0.5 w-full rounded bg-current" />
                <span className="h-0.5 w-full rounded bg-current" />
              </span>
            </button>
          </div>

          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl bg-white/95 p-3 text-sm text-zinc-700 shadow-lg ring-1 ring-zinc-200/70 backdrop-blur md:hidden">
              <div className="grid gap-2">
                <Link
                  className="rounded-lg px-3 py-2 font-semibold transition hover:bg-zinc-100"
                  href="/#gallery"
                  onClick={() => setIsOpen(false)}
                >
                  Gallery
                </Link>
                <Link
                  className="rounded-lg px-3 py-2 font-semibold transition hover:bg-zinc-100"
                  href="/#pricing"
                  onClick={() => setIsOpen(false)}
                >
                  Pricing
                </Link>
                <Link
                  className="rounded-lg px-3 py-2 font-semibold transition hover:bg-zinc-100"
                  href="/#reviews"
                  onClick={() => setIsOpen(false)}
                >
                  Reviews
                </Link>
                {user ? (
                  <Link
                    className="rounded-lg px-3 py-2 font-semibold transition hover:bg-zinc-100"
                    href="/projects"
                    onClick={() => setIsOpen(false)}
                  >
                    My Storybooks
                  </Link>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
