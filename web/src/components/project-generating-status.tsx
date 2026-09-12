'use client'

import { Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { feltProgress, formatElapsed, friendlyStageLabel, liveHint } from '@/lib/generation-status'
import { cn } from '@/lib/utils'

export function PageFrame ({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative mx-auto w-full min-w-0 max-w-full overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200',
        'aspect-square',
        className
      )}
    >
      {children}
    </div>
  )
}

export function ContainedImage ({
  src,
  alt,
  className
}: {
  src: string
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-zinc-500">
        Preview unavailable
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={cn('absolute inset-0 h-full w-full max-w-full object-contain', className)}
    />
  )
}

export function ShimmerBlock ({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-zinc-200/80 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmerSlide_1.6s_ease_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  )
}

export function ProjectGeneratingStatus ({
  stage,
  imagesDone = 0,
  imagesTotal = 12,
  startedAt
}: {
  stage?: string | null
  imagesDone?: number
  imagesTotal?: number
  startedAt?: number | null
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [])

  const startedMs = startedAt && startedAt < 1e12 ? startedAt * 1000 : (startedAt || now)
  const elapsedMs = Math.max(0, now - startedMs)
  const pct = feltProgress({ stage, imagesDone, imagesTotal, elapsedMs })
  const label = friendlyStageLabel(stage)
  const hint = liveHint(elapsedMs, imagesDone)
  const total = imagesTotal || 12
  const inFlight = Math.max(0, total - imagesDone)

  return (
    <div className="mt-4 border-t border-zinc-100 pt-4 sm:mt-6 sm:pt-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
          <Sparkles className="h-4 w-4 shrink-0 animate-spin text-violet-500" />
          <span>{label}</span>
        </p>
        <p className="text-xs font-medium text-zinc-500">
          {imagesDone} / {total} ready · {inFlight > 0 ? `${inFlight} painting now` : 'wrapping up'}
        </p>
      </div>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full bg-gradient-to-r from-violet-500 via-pink-500 to-orange-500 transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(8, pct)}%` }}
        />
        <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmerSlide_1.8s_linear_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <p>{hint}</p>
        <p className="tabular-nums text-zinc-400">Working {formatElapsed(elapsedMs)}</p>
      </div>
    </div>
  )
}

export function GeneratingPreview ({
  title,
  subtitle
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="relative flex h-full min-h-[200px] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-violet-50 via-pink-50 to-orange-50 sm:min-h-[240px] lg:min-h-0">
      <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmerSlide_2s_ease_infinite] bg-gradient-to-r from-transparent via-white/55 to-transparent" />
      <div className="relative z-10 max-w-[16rem] px-3 py-5 text-center sm:max-w-[18rem] sm:px-4 sm:py-6">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
          <Sparkles className="h-6 w-6 animate-spin text-violet-500" />
        </div>
        <p className="text-sm font-semibold text-zinc-800">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{subtitle}</p>
        <div className="mt-4 flex justify-center gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.2s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:-0.1s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-orange-400" />
        </div>
      </div>
    </div>
  )
}
