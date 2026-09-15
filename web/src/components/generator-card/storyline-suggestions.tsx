'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'
import {
  STORY_OCCASIONS,
  STORY_TONES,
  STORY_VIBES,
  STORY_WHO,
  STORYLINE_MAX,
  buildStoryline,
  isStoryOccasionId,
  isStoryToneId,
  isStoryVibeId,
  isStoryWhoId,
  type StoryDraft,
  type StoryOccasionId,
  type StoryToneId,
  type StoryVibeId,
  type StoryWhoId
} from '@/lib/story-suggestions'

type Step = 'who' | 'vibe' | 'occasion' | 'tone'

const STEPS: Record<Step, { label: string, chips: { id: string, label: string }[] }> = {
  who: { label: 'Who is this for?', chips: STORY_WHO },
  vibe: { label: 'What kind of story?', chips: STORY_VIBES },
  occasion: { label: 'What is the occasion?', chips: STORY_OCCASIONS },
  tone: { label: 'How should it feel?', chips: STORY_TONES }
}

function ChipRow ({
  chips,
  disabled,
  onPick
}: {
  chips: { id: string, label: string }[]
  disabled?: boolean
  onPick: (id: string) => void
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(chip.id)}
          className={cn(
            'shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-200/80 transition hover:bg-zinc-200/80',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}

export function StorylineSuggestions ({
  names,
  value,
  onSelect,
  disabled
}: {
  names: string[]
  value: string
  onSelect: (next: string) => void
  disabled?: boolean
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('who')
  const [who, setWho] = useState<StoryWhoId | null>(null)
  const [vibe, setVibe] = useState<StoryVibeId | null>(null)
  const [occasion, setOccasion] = useState<StoryOccasionId | null>(null)
  const [tone, setTone] = useState<StoryToneId | null>(null)
  const lastBuilt = useRef('')
  const namesKey = names.map((n) => n.trim()).filter(Boolean).join('|')

  const apply = (next: Omit<StoryDraft, 'names'> & { names?: string[] }) => {
    const text = buildStoryline({
      who: next.who,
      vibe: next.vibe,
      occasion: next.occasion,
      tone: next.tone,
      names: next.names ?? names
    })
    if (!text) return
    lastBuilt.current = text
    onSelect(text)
  }

  useEffect(() => {
    if (!who && !vibe && !occasion && !tone) return
    if (value !== lastBuilt.current) return
    apply({ who, vibe, occasion, tone, names })
    // Refresh the filled line when they type a character name, but never overwrite a custom edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey])

  const finish = () => {
    setOpen(false)
    setStep('who')
  }

  const startOver = () => {
    setWho(null)
    setVibe(null)
    setOccasion(null)
    setTone(null)
    setStep('who')
    setOpen(true)
  }

  const pickWho = (id: string) => {
    if (!isStoryWhoId(id)) return
    setWho(id)
    apply({ who: id, vibe: null, occasion: null, tone: null })
    setStep('vibe')
    trackEvent('storyline_suggestion', { who: id, step: 'who' })
  }

  const pickVibe = (id: string) => {
    if (!isStoryVibeId(id)) return
    setVibe(id)
    apply({ who, vibe: id, occasion: null, tone: null })
    setStep('occasion')
    trackEvent('storyline_suggestion', { who, vibe: id, step: 'vibe' })
  }

  const pickOccasion = (id: string) => {
    if (!isStoryOccasionId(id)) return
    setOccasion(id)
    apply({ who, vibe, occasion: id, tone: null })
    setStep('tone')
    trackEvent('storyline_suggestion', { who, vibe, occasion: id, step: 'occasion' })
  }

  const pickTone = (id: string) => {
    if (!isStoryToneId(id)) return
    setTone(id)
    apply({ who, vibe, occasion, tone: id })
    trackEvent('storyline_suggestion', { who, vibe, occasion, tone: id, step: 'tone' })
    finish()
  }

  const onPick = (id: string) => {
    if (step === 'who') pickWho(id)
    else if (step === 'vibe') pickVibe(id)
    else if (step === 'occasion') pickOccasion(id)
    else pickTone(id)
  }

  const used = Boolean(who || vibe || occasion || tone || value.trim())
  const nearCap = value.trim().length > STORYLINE_MAX - 400
  const current = STEPS[step]

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-zinc-400">
          {nearCap
            ? `${STORYLINE_MAX - value.trim().length} characters left`
            : used
              ? 'Starter added. Edit it above, or write more.'
              : 'A sentence is enough — or write up to about two pages.'}
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={used ? startOver : () => setOpen(true)}
          className="shrink-0 text-[11px] font-medium text-zinc-600 underline-offset-2 hover:underline disabled:opacity-50"
        >
          {used ? 'New starter' : 'Help me write it'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-zinc-500">{current.label}</p>
        <button
          type="button"
          disabled={disabled}
          onClick={finish}
          className="shrink-0 text-[11px] font-medium text-zinc-600 underline-offset-2 hover:underline disabled:opacity-50"
        >
          {used ? 'Done' : 'Skip'}
        </button>
      </div>
      <ChipRow chips={current.chips} disabled={disabled} onPick={onPick} />
    </div>
  )
}
