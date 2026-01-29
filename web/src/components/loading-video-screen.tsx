'use client'

import { cn } from '@/lib/utils'

const MIN_WAIT_MS = 4 * 60 * 1000

export function LoadingVideoScreen ({
  className
}: {
  className?: string
}) {
  return (
    <section className={cn('min-h-screen py-10 sm:py-12', className)}>
      <div className="mx-auto max-w-4xl px-4">
        <div className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/40 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/20">
          <div className="relative aspect-video w-full bg-black">
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src="/loading.mp4"
              autoPlay
              muted
              playsInline
              loop
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/40 to-black/70" />

            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <div className="text-base font-semibold tracking-tight text-white/95">
                Generating…
              </div>
              <div className="mt-1 text-sm text-white/75">
                Please wait ~4 minutes.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function getMinWaitMs () {
  return MIN_WAIT_MS
}

