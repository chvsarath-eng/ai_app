import * as React from 'react'

import { cn } from '@/lib/utils'

export function HeroSplit ({
  left,
  right,
  className
}: {
  left: React.ReactNode
  right: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex min-h-[calc(100dvh-14rem)] items-stretch pt-4 pb-0 sm:pt-6 sm:pb-0 lg:pt-8 lg:pb-0',
        className
      )}
    >
      <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(380px,480px)]">
        <div className="order-1 min-w-0 lg:order-1 lg:pt-2">
          {left}
        </div>
        <div className="order-2 min-w-0 lg:order-2 lg:justify-self-center">
          {right}
        </div>
      </div>
    </section>
  )
}

