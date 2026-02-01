'use client'

import * as React from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'img2x-skip-photo-guide'

const STEPS = [
  {
    type: 'good' as const,
    src: '/guidelines/good-front.png',
    title: 'Use photos like this',
    desc: 'Straight-on headshot with even lighting'
  },
  {
    type: 'bad' as const,
    src: '/guidelines/bad-side-angle.png',
    title: 'Avoid side angles',
    desc: 'Face should look directly at camera'
  },
  {
    type: 'bad' as const,
    src: '/guidelines/bad-smile.png',
    title: 'Avoid open-mouth smiles',
    desc: 'Neutral expression works best'
  },
  {
    type: 'bad' as const,
    src: '/guidelines/bad-low-quality.png',
    title: 'Avoid blurry photos',
    desc: 'Use high-quality, sharp images'
  }
]

export function PhotoGuidelinesDialog ({
  isOpen,
  onOpenChange,
  onContinue
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onContinue: () => void
}) {
  const [step, setStep] = React.useState(0)
  const [dontShowAgain, setDontShowAgain] = React.useState(false)
  const [shouldSkip, setShouldSkip] = React.useState(false)

  // Check localStorage on mount to see if user opted out
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const skip = localStorage.getItem(STORAGE_KEY) === 'true'
      setShouldSkip(skip)
    }
  }, [])

  // If dialog opens and user has opted out, skip immediately
  React.useEffect(() => {
    if (isOpen && shouldSkip) {
      onOpenChange(false)
      onContinue()
    }
  }, [isOpen, shouldSkip, onOpenChange, onContinue])

  // Reset step when dialog opens
  React.useEffect(() => {
    if (isOpen && !shouldSkip) {
      setStep(0)
      setDontShowAgain(false)
    }
  }, [isOpen, shouldSkip])

  const currentStep = STEPS[step]
  const isLastStep = step === STEPS.length - 1
  const isGood = currentStep.type === 'good'

  function handleNext () {
    if (isLastStep) {
      // Save preference if checked
      if (dontShowAgain && typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, 'true')
        setShouldSkip(true)
      }
      onOpenChange(false)
      onContinue()
    } else {
      setStep(prev => prev + 1)
    }
  }

  // Don't render if user opted out
  if (shouldSkip && isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Photo guidelines</DialogTitle>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-5 pb-3">
          {STEPS.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setStep(idx)}
              aria-label={`Go to step ${idx + 1}`}
              className={cn(
                'h-2 w-2 rounded-full transition-all duration-200',
                idx === step
                  ? 'w-6 bg-violet-600'
                  : idx < step
                    ? 'bg-violet-300'
                    : 'bg-zinc-200'
              )}
            />
          ))}
        </div>

        {/* Step content with transition */}
        <div className="relative px-5 pb-5">
          <div
            key={step}
            className="animate-in fade-in slide-in-from-right-4 duration-200"
          >
            {/* Image card */}
            <div
              className={cn(
                'mx-auto w-full max-w-[240px] overflow-hidden rounded-2xl border p-3 shadow-sm transition-colors',
                isGood
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : 'border-red-200 bg-red-50/50'
              )}
            >
              {/* Badge */}
              <div className="mb-2 flex items-center gap-2">
                {isGood ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Good
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-red-700">
                      Avoid
                    </span>
                  </>
                )}
              </div>

              {/* Photo */}
              <div
                className={cn(
                  'relative aspect-square w-full overflow-hidden rounded-xl border',
                  isGood ? 'border-emerald-200' : 'border-red-200'
                )}
              >
                <img
                  src={currentStep.src}
                  alt={currentStep.title}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            {/* Text */}
            <div className="mt-4 text-center">
              <h3 className="text-base font-semibold text-zinc-900">
                {currentStep.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                {currentStep.desc}
              </p>
            </div>

            {/* Button */}
            <Button
              type="button"
              onClick={handleNext}
              className="mt-5 w-full h-11 text-sm font-semibold"
            >
              {isLastStep ? 'Upload my photo' : 'Got it, next'}
            </Button>

            {/* Don't show again checkbox */}
            <label className="mt-4 flex items-center justify-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={e => setDontShowAgain(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-xs text-zinc-500">
                Don&apos;t show this again
              </span>
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
