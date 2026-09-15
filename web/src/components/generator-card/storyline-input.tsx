'use client'

import * as React from 'react'

import { Textarea } from '@/components/ui/textarea'
import { STORYLINE_MAX } from '@/lib/story-suggestions'
import { cn } from '@/lib/utils'

type Props = React.ComponentPropsWithoutRef<typeof Textarea> & {
  isDisabled?: boolean
  /** Keep the home form compact; create page can grow to about two pages. */
  roomy?: boolean
}

function mergeRefs<T> (
  ...refs: Array<React.Ref<T> | undefined>
) {
  return (node: T) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') ref(node)
      else (ref as React.MutableRefObject<T | null>).current = node
    }
  }
}

export const StorylineInput = React.forwardRef<HTMLTextAreaElement, Props>(function StorylineInput (
  { isDisabled, roomy = false, className, onInput, onChange, value, ...props },
  ref
) {
  const localRef = React.useRef<HTMLTextAreaElement | null>(null)
  const fit = React.useCallback(() => {
    const el = localRef.current
    if (!el) return
    const view = typeof window === 'undefined' ? 800 : window.innerHeight
    const maxPx = roomy ? Math.min(720, Math.round(view * 0.7)) : Math.min(360, Math.round(view * 0.4))
    el.style.height = 'auto'
    const next = Math.min(Math.max(el.scrollHeight, 88), maxPx)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden'
  }, [roomy])

  React.useLayoutEffect(() => {
    fit()
    if (typeof window === 'undefined') return
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [fit, value])

  return (
    <Textarea
      {...props}
      ref={mergeRefs(localRef, ref)}
      disabled={isDisabled}
      maxLength={STORYLINE_MAX}
      value={value}
      rows={3}
      onChange={(event) => {
        onChange?.(event)
        requestAnimationFrame(fit)
      }}
      onInput={(event) => {
        onInput?.(event)
        fit()
      }}
      className={cn('min-h-[88px] resize-none overflow-hidden leading-relaxed', className)}
    />
  )
})
