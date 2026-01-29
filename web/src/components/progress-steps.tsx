'use client'

import { Check, CircleDashed } from 'lucide-react'

import type { JobStatusResponse } from '@/types/storybook'
import { cn } from '@/lib/utils'

const stepOrder = [
  'UPLOAD_RECEIVED',
  'STORY_CREATED',
  'IMAGES_GENERATING',
  'BOOK_BUILDING',
  'DONE'
] as const

const stepLabel: Record<(typeof stepOrder)[number], string> = {
  UPLOAD_RECEIVED: 'Photo received',
  STORY_CREATED: 'Story created',
  IMAGES_GENERATING: 'Generating images',
  BOOK_BUILDING: 'Building book',
  DONE: 'Ready'
}

function getStepIndex (stage?: JobStatusResponse['stage']) {
  if (!stage) return -1
  return stepOrder.indexOf(stage)
}

export function ProgressSteps ({ job }: { job: JobStatusResponse }) {
  const active = getStepIndex(job.stage)

  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Generation progress">
      {stepOrder.map((s, idx) => {
        const isComplete = active > idx || job.status === 'DONE'
        const isActive = active === idx && job.status !== 'DONE'
        const progressText = s === 'IMAGES_GENERATING' && job.progress
          ? ` (${job.progress.current}/${job.progress.total})`
          : ''

        return (
          <li
            key={s}
            className={cn(
              'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm',
              isComplete
                ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-500/10 dark:text-emerald-200'
                : isActive
                  ? 'border-violet-200 bg-violet-50/50 text-zinc-950 dark:border-violet-900/40 dark:bg-violet-500/10 dark:text-zinc-50'
                  : 'border-zinc-200/70 bg-white/40 text-zinc-600 dark:border-zinc-800/70 dark:bg-zinc-950/20 dark:text-zinc-400'
            )}
            aria-current={isActive ? 'step' : undefined}
          >
            <span className={cn(
              'grid h-7 w-7 place-items-center rounded-full border',
              isComplete
                ? 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-900/40 dark:bg-zinc-950 dark:text-emerald-200'
                : isActive
                  ? 'border-violet-200 bg-white text-violet-700 dark:border-violet-900/40 dark:bg-zinc-950 dark:text-violet-200'
                  : 'border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500'
            )}>
              {isComplete
                ? <Check className="h-4 w-4" aria-hidden="true" />
                : <CircleDashed className="h-4 w-4" aria-hidden="true" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {stepLabel[s]}{progressText}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

