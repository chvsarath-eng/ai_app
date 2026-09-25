'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, BookOpen, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectGeneratingStatus } from '@/components/project-generating-status'
import type { Project } from '@/types/project'
import { cn } from '@/lib/utils'

export function BookGenerationWorkspace ({ project, selected, onSelect, imageUrl, onResume, resuming, resumeError }: {
  project: Project
  selected: number
  onSelect: (page: number) => void
  imageUrl: (page: number) => string | null
  onResume: () => void
  resuming: boolean
  resumeError: string | null
}) {
  const [showStory, setShowStory] = useState(false)
  const failed = project.status === 'failed'
  const writing = !/image|pdf|upload|pipeline/.test(project.stage || '') && !project.imagesDone
  const scenes = project.story?.pages || []
  const selectedStory = scenes.find(p => p.pageNumber === selected)?.story
  const art = imageUrl(selected)
  const title = project.title || project.story?.title || 'Your storybook is taking shape'
  return (
    <section data-testid="generation-workspace" className="mx-auto flex h-[calc(100dvh-64px)] min-h-[440px] max-w-6xl flex-col gap-3 py-4">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-zinc-600"><ArrowLeft className="h-4 w-4" /> My storybooks</Link>
        <span className="text-xs text-zinc-500">{project.outputType === 'QUICK_BOOK' ? 'Quick Book · 24 A4 pages' : 'Personalized storybook'}</span>
      </div>
      <div data-testid="generation-progress" className="shrink-0 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:px-5 sm:py-4">
        <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{failed ? 'Your book needs another attempt' : title}</h1>
        {project.outputType === 'QUICK_BOOK' && project.artifacts?.pdf?.url && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 p-3">
            <p className="text-sm text-emerald-900">Your print file is ready. The digital book is finishing.</p>
            <Button asChild size="sm"><a href={project.artifacts.pdf.url} target="_blank" rel="noreferrer">Download A3 PDF</a></Button>
          </div>
        )}
        {failed ? (
          <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="max-w-xl text-xs leading-relaxed text-zinc-600">We couldn’t finish this book. Your order and saved work are kept. Resume without another payment.</p>
            <Button size="sm" disabled={resuming} onClick={onResume}>{resuming ? 'Resuming…' : 'Resume this book'}</Button>
            {resumeError && <p className="w-full text-xs text-rose-700">{resumeError}</p>}
          </div>
        ) : <ProjectGeneratingStatus stage={project.stage} imagesDone={project.imagesDone || 0} imagesTotal={project.imagesTotal || 12}
          startedAt={project.startedAt || project.paidAt || project.createdAt} />}
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-3 lg:grid-cols-[208px_1fr] lg:grid-rows-1">
        <nav aria-label="Book scenes" className="order-2 flex min-h-0 gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-2 lg:order-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
          {Array.from({ length: 11 }, (_, page) => {
            const url = imageUrl(page)
            return <button key={page} aria-pressed={selected === page} onClick={() => { onSelect(page); setShowStory(false) }}
              className={cn('flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs lg:w-full', selected === page ? 'border-violet-400 bg-violet-50 text-violet-900' : 'border-transparent text-zinc-600 hover:bg-zinc-50')}>
              <span className="relative flex h-9 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-100">
                {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : page === 0 ? <BookOpen className="h-4 w-4" /> : page}
              </span>
              <span className="whitespace-nowrap">{page === 0 ? 'Cover' : `Scene ${page}`}<span className="hidden text-[11px] text-zinc-500 lg:block">{url ? 'Ready' : failed ? 'Pending' : writing ? 'Waiting for story' : 'Preparing illustration'}</span></span>
            </button>
          })}
        </nav>
        <div className="order-1 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white lg:order-2">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2">
            <h2 className="text-sm font-medium">{selected === 0 ? 'Cover' : `Scene ${selected}`}</h2>
            {selectedStory && art && <Button size="sm" variant="ghost" onClick={() => setShowStory(!showStory)}>{showStory ? 'Show illustration' : 'Read scene'}</Button>}
            <span className="text-xs text-zinc-500">{project.imagesDone || 0} illustrations ready</span>
          </div>
          <div data-testid="generation-preview" className="relative min-h-0 flex-1 overflow-hidden bg-gradient-to-br from-violet-50 via-white to-pink-50">
            {(showStory || !art) && selectedStory ? <div className="h-full overflow-y-auto p-5 sm:p-8">{!art && <p className="mx-auto mb-4 max-w-prose text-xs font-medium text-violet-700">Story ready · {failed ? 'resume to finish the artwork' : 'artwork in progress'}</p>}<p className="mx-auto max-w-prose whitespace-pre-line font-serif text-base leading-relaxed text-zinc-700">{selectedStory}</p></div>
              : art ? <img src={art} alt={selected === 0 ? 'Generated cover' : `Generated scene ${selected}`} className="absolute inset-0 h-full w-full object-contain p-2 sm:p-4" />
                : <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <Sparkles className={cn('h-7 w-7 text-violet-500', !failed && 'animate-pulse')} />
                  <p className="text-sm font-semibold text-zinc-800">{failed ? 'Your preview will appear here' : writing ? 'Writing your adventure' : 'Creating your illustrations'}</p>
                  <p className="max-w-xs text-xs leading-relaxed text-zinc-500">{failed ? 'Resume the book to continue from saved work.' : writing ? 'The story is checked for length and page layout before illustration begins.' : 'Finished illustrations appear here as they arrive.'}</p>
                </div>}
          </div>
        </div>
      </div>
    </section>
  )
}
