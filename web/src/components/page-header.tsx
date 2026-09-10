import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Section / page title block that mirrors the home page pattern:
 * eyebrow pill -> bold zinc heading with one gradient accent -> muted subtitle.
 */

export type PageHeaderTone = 'violet' | 'emerald' | 'orange'

const eyebrowTone: Record<PageHeaderTone, { pill: string, dot: string }> = {
  violet: {
    pill: 'from-violet-50 to-pink-50 text-violet-600',
    dot: 'bg-violet-400'
  },
  emerald: {
    pill: 'from-emerald-50 to-teal-50 text-emerald-600',
    dot: 'bg-emerald-400'
  },
  orange: {
    pill: 'from-orange-50 to-pink-50 text-orange-600',
    dot: 'bg-orange-400'
  }
}

const accentTone: Record<PageHeaderTone, string> = {
  violet: 'from-orange-500 via-pink-500 to-violet-500',
  emerald: 'from-emerald-500 via-teal-500 to-cyan-500',
  orange: 'from-orange-500 via-pink-500 to-violet-500'
}

export function Eyebrow ({
  children,
  tone = 'violet',
  className
}: {
  children: React.ReactNode
  tone?: PageHeaderTone
  className?: string
}) {
  const t = eyebrowTone[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-4 py-1.5 text-xs font-medium uppercase tracking-widest',
        t.pill,
        className
      )}
    >
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', t.dot)} />
      {children}
    </span>
  )
}

export function Accent ({
  children,
  tone = 'violet'
}: {
  children: React.ReactNode
  tone?: PageHeaderTone
}) {
  return (
    <span className={cn('bg-gradient-to-r bg-clip-text text-transparent', accentTone[tone])}>
      {children}
    </span>
  )
}

export function PageHeader ({
  eyebrow,
  title,
  subtitle,
  tone = 'violet',
  align = 'center',
  size = 'lg',
  actions,
  className
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  tone?: PageHeaderTone
  align?: 'center' | 'left'
  size?: 'lg' | 'md'
  actions?: React.ReactNode
  className?: string
}) {
  const isCenter = align === 'center'
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        isCenter ? 'items-center text-center' : 'items-start text-left',
        actions && !isCenter && 'sm:flex-row sm:items-end sm:justify-between',
        className
      )}
    >
      <div className={cn('flex flex-col gap-3', isCenter ? 'items-center' : 'items-start')}>
        {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
        <h1
          className={cn(
            'font-bold tracking-tight text-zinc-800',
            size === 'lg' ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-2xl sm:text-3xl'
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className={cn('text-sm text-zinc-500 sm:text-base', isCenter ? 'max-w-md' : 'max-w-2xl')}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
