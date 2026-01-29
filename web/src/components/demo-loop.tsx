'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

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
        <img
          src="/brand/preview-cover_new.jpeg"
          alt=""
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className="max-h-full max-w-full object-contain"
          style={{ transform: 'scale(0.9)' }}
        />
      </div>
    )
  }
)

export function DemoLoop ({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isReceded, setIsReceded] = useState(false)

  useEffect(() => {
    // Use scroll position for faster, more sensitive recede trigger
    const handleScroll = () => {
      // Recede as soon as user scrolls more than 40px — very sensitive
      setIsReceded(window.scrollY > 40)
    }

    // Initial check
    handleScroll()

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div
      ref={rootRef}
      className={cn(
        // No "card" container — just floating preview in the hero.
        // Keep the preview area size, but clip overflow so it never
        // spills into the form on the right.
        'relative overflow-hidden bg-[var(--md-surface)]',
        className
      )}
      aria-label="Live 3D preview"
    >
      {/* Give the book real vertical space — increased for larger book */}
      <div className="h-[340px] w-full sm:h-[420px] lg:h-[520px]" />
      <div className="absolute inset-0">
        {/* Very subtle halo so white pages don't merge into the page background */}
        <div
          className={cn(
            'pointer-events-none absolute inset-0 transition-opacity duration-700',
            isReceded ? 'opacity-0' : 'opacity-100',
            'bg-[radial-gradient(520px_circle_at_42%_58%,rgba(0,0,0,0.026),transparent_70%)] sm:bg-[radial-gradient(720px_circle_at_42%_58%,rgba(0,0,0,0.022),transparent_72%)]'
          )}
        />

        <div className="h-full w-full -translate-x-3 sm:-translate-x-6">
          <R3FBookPreview isReceded={isReceded} />
        </div>
      </div>
    </div>
  )
}
