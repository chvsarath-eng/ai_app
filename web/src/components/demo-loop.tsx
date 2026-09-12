'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { HeroCoverImage } from '@/components/hero-cover'
import { cn } from '@/lib/utils'

const R3FBookPreview = dynamic(
  async () => {
    const mod = await import('@/components/r3f-book-preview')
    return mod.R3FBookPreview
  },
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-[var(--md-surface)]">
        <HeroCoverImage alt="" />
      </div>
    )
  }
)

export function DemoLoop ({
  children,
  className
}: {
  children?: ReactNode
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isReceded, setIsReceded] = useState(false)
  const [isInView, setIsInView] = useState(true)
  const [isPageVisible, setIsPageVisible] = useState(true)
  const [isBookRevealed, setIsBookRevealed] = useState(false)
  const isActive = isInView && isPageVisible
  const handleBookRevealed = useCallback(() => setIsBookRevealed(true), [])

  useEffect(() => {
    const handleScroll = () => {
      setIsReceded(window.scrollY > 40)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.2))
      },
      { threshold: [0, 0.2, 0.5] }
    )
    observer.observe(node)

    const handleVisibility = () => {
      setIsPageVisible(document.visibilityState === 'visible')
    }
    handleVisibility()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className={cn(
        // No "card" container — just floating preview in the hero.
        // Keep the preview area size, but clip overflow so it never
        // spills into the form on the right.
        'relative h-full min-h-[360px] overflow-hidden bg-[var(--md-surface)] sm:min-h-0',
        className
      )}
      aria-label="Live 3D preview"
    >
      {/* Give the book real vertical space — increased for larger book */}
      <div className="h-full min-h-[360px] w-full sm:h-[420px] sm:min-h-0 lg:h-[520px]" />
      <div className="absolute inset-0">
        {/* Fast first paint. Hide once the 3D book is rotating so both never stack. */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-opacity duration-500',
            isBookRevealed ? 'pointer-events-none opacity-0' : 'opacity-100'
          )}
          aria-hidden={isBookRevealed}
        >
          {children ?? <HeroCoverImage alt="" />}
        </div>
        {/* Very subtle halo so white pages don't merge into the page background */}
        <div
          className={cn(
            'pointer-events-none absolute inset-0 transition-opacity duration-700',
            isReceded ? 'opacity-0' : 'opacity-100',
            'bg-[radial-gradient(520px_circle_at_50%_58%,rgba(0,0,0,0.026),transparent_70%)] sm:bg-[radial-gradient(720px_circle_at_50%_58%,rgba(0,0,0,0.022),transparent_72%)]'
          )}
        />

        <div className="relative h-full w-full">
          <R3FBookPreview
            isReceded={isReceded}
            isActive={isActive}
            onBookRevealed={handleBookRevealed}
          />
        </div>
      </div>
    </div>
  )
}
