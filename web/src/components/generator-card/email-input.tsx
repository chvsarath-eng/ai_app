'use client'

import * as React from 'react'

import { Input } from '@/components/ui/input'

type Props = React.ComponentPropsWithoutRef<typeof Input> & {
  isDisabled?: boolean
}

export const EmailInput = React.forwardRef<HTMLInputElement, Props>(function EmailInput (
  { isDisabled, ...props },
  ref
) {
  return (
    <Input
      ref={ref}
      type="email"
      disabled={isDisabled}
      {...props}
    />
  )
})

