'use client'

import { cn } from '@/lib/utils'
import { useLocalizedPrices } from '@/lib/use-localized-prices'

export function LocalizedPrice ({
  kind,
  className
}: {
  kind: 'digital' | 'hardcover'
  className?: string
}) {
  const { prices, isLoading } = useLocalizedPrices()

  if (isLoading) {
    return (
      <span
        className={cn('inline-block h-5 w-16 animate-pulse rounded bg-zinc-200 align-middle', className)}
        aria-hidden="true"
      />
    )
  }

  return <span className={className}>{kind === 'digital' ? prices.digital.price : prices.hardcover.price}</span>
}
