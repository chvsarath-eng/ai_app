import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-zinc-950 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950',
        secondary: 'border-transparent bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50',
        outline: 'text-zinc-950 dark:text-zinc-50'
      }
    },
    defaultVariants: {
      variant: 'secondary'
    }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> {}

export function Badge ({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

