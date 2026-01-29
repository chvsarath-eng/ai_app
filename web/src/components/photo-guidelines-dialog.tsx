'use client'

import * as React from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function ExampleThumb ({
  label,
  variant,
  src
}: {
  label: string
  variant: 'good' | 'bad'
  src: string
}) {
  return (
    <div
      className={cn(
        'relative mx-auto w-full max-w-[180px] shrink-0 snap-start overflow-hidden rounded-2xl border bg-white p-2.5 shadow-sm sm:max-w-[240px] sm:p-3',
        variant === 'good' ? 'border-emerald-200/70' : 'border-red-200/70'
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-tight sm:text-sm">
        {variant === 'good'
          ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          : <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />}
        {label}
      </div>
      <div className={cn(
        'relative aspect-square w-full overflow-hidden rounded-xl border',
        variant === 'good' ? 'border-emerald-200' : 'border-red-200'
      )}>
        <img
          src={src}
          alt={label}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    </div>
  )
}

export function PhotoGuidelinesDialog ({
  isOpen,
  onOpenChange,
  onContinue
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onContinue: () => void
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = React.useState(1)

  React.useEffect(() => {
    if (!isOpen) return
    setScale(1)
  }, [isOpen])

  React.useEffect(() => {
    if (!isOpen) return
    setScale(1)
    const computeScale = () => {
      const el = contentRef.current
      if (!el) return

      if (window.innerWidth < 640) {
        setScale(1)
        return
      }

      const padding = 16
      const maxW = window.innerWidth - padding * 2
      const maxH = window.innerHeight - padding * 2

      const rect = el.getBoundingClientRect()
      const next = Math.min(1, maxW / rect.width, maxH / rect.height)
      setScale(Math.max(0.72, next))
    }

    const frame = requestAnimationFrame(computeScale)
    const onResize = () => computeScale()

    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="max-w-3xl overflow-y-auto p-4 sm:overflow-visible sm:p-6"
        style={{ ['--dialog-scale' as unknown as string]: scale } as React.CSSProperties}
      >
        <DialogHeader>
          <DialogTitle className="text-lg leading-tight sm:text-xl">Choose a photo that works best</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed sm:text-base">
            Best results come from a <strong>straight-on headshot</strong> with even lighting.
            Avoid side angles, open-mouth smiles, and blurry photos.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 sm:hidden">
          <Button
            type="button"
            className="w-full shadow-sm"
            onClick={() => {
              onOpenChange(false)
              onContinue()
            }}
          >
            Upload photo
          </Button>
        </div>

        <div className="mt-5 sm:mt-6">
          <section className="rounded-3xl border border-zinc-200/70 bg-zinc-50/60 p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center justify-between sm:mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  Good
                </span>
                <span className="text-xs text-zinc-500">Use this</span>
              </div>
            </div>

            <div className="mx-auto max-w-[220px] sm:max-w-[260px]">
              <ExampleThumb
                variant="good"
                label="Straight-on headshot"
                src="/guidelines/good-front.png"
              />
            </div>

            <div className="mt-4 border-t border-zinc-200/70 pt-4">
              <div className="mb-3 flex items-center justify-between sm:mb-4">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                    Avoid
                  </span>
                  <span className="text-xs text-zinc-500">Common failure cases</span>
                </div>
                <span className="text-[11px] text-zinc-500 sm:hidden">Swipe to see more</span>
              </div>

              <div className="-mx-2 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 px-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:pb-0 sm:px-0">
                <ExampleThumb variant="bad" label="Side angle" src="/guidelines/bad-side-angle.png" />
                <ExampleThumb variant="bad" label="Open-mouth smile" src="/guidelines/bad-smile.png" />
                <ExampleThumb variant="bad" label="Blurry / low quality" src="/guidelines/bad-low-quality.png" />
              </div>
            </div>
          </section>
        </div>

        <div className="mt-5 hidden flex-col gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false)
                onContinue()
              }}
            >
              Continue to upload
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

