'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { AccountPanel, UserMenu } from '@/components/auth/user-menu'
import { useAuthStore } from '@/lib/auth-store'

export function SiteHeader ({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const user = useAuthStore((s) => s.user)

  function closeMenu () {
    setIsOpen(false)
  }

  return (
    <header
      className={cn(
        'sticky top-[max(0.75rem,env(safe-area-inset-top))] z-50',
        className
      )}
    >
      <div className="w-full px-3 sm:px-4 lg:px-6">
        <div className="relative flex h-11 w-full items-center justify-between rounded-2xl bg-white/85 px-4 shadow-md ring-1 ring-zinc-200/70 backdrop-blur sm:px-5">
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

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-700 transition hover:bg-zinc-100 md:hidden"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className={cn('absolute h-0.5 w-full rounded bg-current transition', isOpen ? 'rotate-45' : '-translate-y-[5px]')} />
              <span className={cn('absolute h-0.5 w-full rounded bg-current transition', isOpen ? 'opacity-0' : 'opacity-100')} />
              <span className={cn('absolute h-0.5 w-full rounded bg-current transition', isOpen ? '-rotate-45' : 'translate-y-[5px]')} />
            </span>
          </button>

          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl bg-white/95 p-3 text-sm text-zinc-700 shadow-lg ring-1 ring-zinc-200/70 backdrop-blur md:hidden">
              <AccountPanel onNavigate={closeMenu} />
              <div className="my-2 h-px bg-zinc-100" />
              <div className="grid">
                <Link
                  className="rounded-lg px-3 py-2.5 font-semibold transition hover:bg-zinc-100"
                  href="/#gallery"
                  onClick={closeMenu}
                >
                  Gallery
                </Link>
                <Link
                  className="rounded-lg px-3 py-2.5 font-semibold transition hover:bg-zinc-100"
                  href="/#pricing"
                  onClick={closeMenu}
                >
                  Pricing
                </Link>
                <Link
                  className="rounded-lg px-3 py-2.5 font-semibold transition hover:bg-zinc-100"
                  href="/#reviews"
                  onClick={closeMenu}
                >
                  Reviews
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
