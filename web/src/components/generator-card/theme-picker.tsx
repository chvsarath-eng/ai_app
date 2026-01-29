'use client'

import * as React from 'react'
import { Crown, Rocket, Shield, Shirt, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Theme } from '@/types/storybook'

type Props = {
  value: Theme
  onChange: (theme: Theme) => void
  isDisabled?: boolean
}

const themeMeta: Record<Theme, { label: Theme, icon: React.ComponentType<{ className?: string }> }> = {
  Cowboy: { label: 'Cowboy', icon: Shirt },
  Space: { label: 'Space', icon: Rocket },
  Princess: { label: 'Princess', icon: Crown },
  Superhero: { label: 'Superhero', icon: Shield },
  Custom: { label: 'Custom', icon: Sparkles }
}

export function ThemePicker ({ value, onChange, isDisabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(themeMeta) as Theme[]).map((theme) => {
        const Icon = themeMeta[theme].icon
        const isSelected = theme === value
        return (
          <button
            key={theme}
            type="button"
            onClick={() => onChange(theme)}
            disabled={isDisabled}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--md-primary)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60',
              isSelected
                ? 'border-transparent bg-[color:var(--md-primary)] text-white shadow-sm'
                : 'border-zinc-200 bg-white text-zinc-950 hover:bg-zinc-50'
            )}
            aria-pressed={isSelected ? 'true' : 'false'}
          >
            <Icon className="h-4 w-4 opacity-80" aria-hidden="true" />
            {themeMeta[theme].label}
          </button>
        )
      })}
    </div>
  )
}

