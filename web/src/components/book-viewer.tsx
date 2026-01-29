'use client'

import * as React from 'react'

import type { JobStatusResponse } from '@/types/storybook'
import { cn } from '@/lib/utils'

type Page = NonNullable<JobStatusResponse['previewPages']>[number]

function buildPageDoc (page: Page) {
  const body = page.htmlSnippet ?? `<p>Page ${page.pageNumber}</p>`
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system; background: #0b0b10; color: #f5f5f7; }
      .wrap { padding: 22px; }
      .card { border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; background: rgba(255,255,255,0.06); padding: 18px; }
      h2 { margin: 0 0 10px; letter-spacing: -0.03em; }
      p { margin: 0; line-height: 1.7; color: rgba(255,255,255,0.85); }
      code { color: rgba(255,255,255,0.9); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h2>Page ${page.pageNumber}</h2>
        ${body}
      </div>
    </div>
  </body>
</html>`
}

export function BookViewer ({
  pages,
  selectedPage,
  onSelectPage
}: {
  pages: Page[]
  selectedPage: number
  onSelectPage: (pageNumber: number) => void
}) {
  const sorted = React.useMemo(() => pages.slice().sort((a, b) => a.pageNumber - b.pageNumber), [pages])
  const active = sorted.find((p) => p.pageNumber === selectedPage) ?? sorted[0]

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-3xl border border-zinc-200/70 bg-white/40 p-3 dark:border-zinc-800/70 dark:bg-zinc-950/20">
        <div className="px-2 pb-2 text-sm font-medium tracking-tight">Pages</div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-2">
          {sorted.map((p) => {
            const isSelected = p.pageNumber === selectedPage
            return (
              <button
                key={p.pageNumber}
                type="button"
                className={cn(
                  'overflow-hidden rounded-2xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-50 dark:ring-offset-zinc-950',
                  isSelected ? 'border-violet-400' : 'border-zinc-200/70 dark:border-zinc-800/70'
                )}
                onClick={() => onSelectPage(p.pageNumber)}
                aria-label={`Open page ${p.pageNumber}`}
                aria-pressed={isSelected ? 'true' : 'false'}
              >
                <div className="relative aspect-[3/4] bg-zinc-100 dark:bg-zinc-900">
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
                <div className="px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400">Page {p.pageNumber}</div>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/40 dark:border-zinc-800/70 dark:bg-zinc-950/20">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200/70 px-5 py-4 dark:border-zinc-800/70">
          <div className="text-sm font-medium tracking-tight">Preview</div>
          <div className="text-xs text-zinc-500">Page {active?.pageNumber}</div>
        </div>

        <div className="p-3 sm:p-4">
          <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-black/90 dark:border-zinc-800/70">
            <iframe
              title={`Preview page ${active?.pageNumber}`}
              className="h-[520px] w-full"
              sandbox=""
              srcDoc={active ? buildPageDoc(active) : undefined}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

