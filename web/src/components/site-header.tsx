'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export function SiteHeader ({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header
      className={cn(
        'sticky top-3 z-50',
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
                className="h-5.5 w-auto drop-shadow-[0_6px_14px_rgba(0,0,0,0.16)] sm:h-6"
              />
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-xs font-bold text-zinc-700 md:flex">
            <Link className="transition hover:text-zinc-950" href="/#gallery">Gallery</Link>
            <Link className="transition hover:text-zinc-950" href="/#pricing">Pricing</Link>
            <Link className="transition hover:text-zinc-950" href="/#reviews">Reviews</Link>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Button asChild className="h-8 px-4 text-xs font-semibold">
              <Link href="/coming-soon">Coming soon</Link>
            </Button>
          </div>

          <button
            type="button"
            className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-700 transition hover:bg-zinc-100 md:hidden"
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
                <Link
                  className="rounded-lg px-3 py-2 font-semibold text-violet-700 transition hover:bg-violet-50"
                  href="/coming-soon"
                  onClick={() => setIsOpen(false)}
                >
                  Coming soon
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

