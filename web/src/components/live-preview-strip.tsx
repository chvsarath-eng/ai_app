'use client'

import { cn } from '@/lib/utils'
import type { JobStatusResponse } from '@/types/storybook'

type Page = NonNullable<JobStatusResponse['previewPages']>[number]

export function LivePreviewStrip ({
  pages,
  selectedPage,
  onSelectPage
}: {
  pages: Page[]
  selectedPage?: number
  onSelectPage: (pageNumber: number) => void
}) {
  if (!pages.length) return null

  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-white/40 p-3 dark:border-zinc-800/70 dark:bg-zinc-950/20">
      <div className="flex items-center justify-between gap-3 px-2 pb-2">
        <div className="text-sm font-medium tracking-tight">Live preview</div>
        <div className="text-xs text-zinc-500">{pages.length} pages</div>
      </div>

      <div className="flex gap-3 overflow-x-auto px-2 pb-2 [-webkit-overflow-scrolling:touch]">
        {pages
          .slice()
          .sort((a, b) => a.pageNumber - b.pageNumber)
          .map((p) => {
            const isSelected = p.pageNumber === selectedPage
            return (
              <button
                key={p.pageNumber}
                type="button"
                className={cn(
                  'relative shrink-0 overflow-hidden rounded-2xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-50 dark:ring-offset-zinc-950',
                  isSelected ? 'border-violet-400' : 'border-zinc-200/70 dark:border-zinc-800/70'
                )}
                onClick={() => onSelectPage(p.pageNumber)}
                aria-label={`Select page ${p.pageNumber}`}
                aria-pressed={isSelected ? 'true' : 'false'}
              >
                <div className="relative h-[116px] w-[88px] bg-zinc-100 dark:bg-zinc-900">
                  {p.thumbnailUrl
                    ? (
                      <img
                        src={p.thumbnailUrl}
                        alt={`Page ${p.pageNumber} thumbnail`}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )
                    : null}
                </div>
                <div className="px-2 py-1 text-left text-xs text-zinc-600 dark:text-zinc-400">
                  Page {p.pageNumber}
                </div>
              </button>
            )
          })}
      </div>
    </div>
  )
}

