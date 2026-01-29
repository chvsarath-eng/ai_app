'use client'

import * as React from 'react'

import { Textarea } from '@/components/ui/textarea'

type Props = React.ComponentPropsWithoutRef<typeof Textarea> & {
  isDisabled?: boolean
}

export const StorylineInput = React.forwardRef<HTMLTextAreaElement, Props>(function StorylineInput (
  { isDisabled, ...props },
  ref
) {
  return (
    <Textarea
      ref={ref}
      disabled={isDisabled}
      {...props}
    />
  )
})

