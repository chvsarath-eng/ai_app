import * as React from 'react'

import { PageHeader } from '@/components/page-header'

/** Shared shell for Privacy / Terms / Refund pages so they read as one family. */
export function LegalPage ({
  title,
  lastUpdated,
  children
}: {
  title: string
  lastUpdated: string
  children: React.ReactNode
}) {
  return (
    <div className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Legal"
        title={title}
        subtitle={`Last updated: ${lastUpdated}`}
        className="mb-10"
      />
      <article className="mx-auto w-full max-w-4xl rounded-3xl border border-zinc-200/70 bg-white/80 px-6 py-8 shadow-sm ring-1 ring-violet-100/60 backdrop-blur sm:px-10 sm:py-12">
        {children}
      </article>
    </div>
  )
}
