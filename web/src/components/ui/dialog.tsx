'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal = DialogPrimitive.Portal
export const DialogClose = DialogPrimitive.Close

export function DialogOverlay ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm',
        className
      )}
      {...props}
    />
  )
}

export const DialogContent = React.forwardRef<
HTMLDivElement,
React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(function DialogContent ({ className, children, style, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-4xl rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-[0_30px_80px_rgba(0,0,0,0.18)] outline-none',
          'max-h-[calc(100dvh-2rem)] overflow-hidden',
          '[@media(max-height:820px)]:p-5',
          className
        )}
        style={{
          ...style,
          transform: 'translate(-50%, -50%) scale(var(--dialog-scale, 1))'
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--md-primary)] focus-visible:ring-offset-2"
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})

export function DialogHeader ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />
}

export function DialogTitle ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-lg font-semibold tracking-tight', className)}
      {...props}
    />
  )
}

export function DialogDescription ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-zinc-600', className)}
      {...props}
    />
  )
}

