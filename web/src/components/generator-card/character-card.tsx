'use client'

import { X, Users } from 'lucide-react'
import { Controller, useFormContext, type FieldErrors } from 'react-hook-form'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { UploadDropzone } from '@/components/generator-card/upload-dropzone'
import { relationships, genders } from '@/types/storybook'

type CharacterFields = {
  imageFile: File
  name: string
  age: number
  gender?: string
  relationship?: string
}

type FormValues = {
  characters: CharacterFields[]
  storyline: string
  outputType: string
}

type Props = {
  index: number
  showExtendedFields: boolean
  isDisabled: boolean
  onRemove?: () => void
}

function getCharError (errors: FieldErrors<FormValues>, index: number, field: keyof CharacterFields) {
  const chars = errors.characters
  if (!chars || !Array.isArray(chars)) return undefined
  const entry = chars[index]
  if (!entry || typeof entry !== 'object') return undefined
  const fieldErr = (entry as Record<string, { message?: string }>)[field]
  return fieldErr?.message
}

export function CharacterCard ({ index, showExtendedFields, isDisabled, onRemove }: Props) {
  const form = useFormContext<FormValues>()
  const prefix = `characters.${index}` as const
  const errors = form.formState.errors

  return (
    <div className="relative rounded-lg border border-zinc-200 bg-white p-3 space-y-3">
      {/* Header with character number and remove button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-violet-500" aria-hidden="true" />
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Character {index + 1}
          </span>
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50"
            onClick={onRemove}
            disabled={isDisabled}
            aria-label={`Remove character ${index + 1}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Photo upload */}
      <Controller
        name={`${prefix}.imageFile`}
        control={form.control}
        render={({ field }) => (
          <UploadDropzone
            value={field.value}
            onChange={(file) => field.onChange(file)}
            isDisabled={isDisabled}
          />
        )}
      />
      {getCharError(errors, index, 'imageFile') && (
        <p className="text-sm text-red-600" role="alert">
          {getCharError(errors, index, 'imageFile')}
        </p>
      )}

      {/* Name + Age row */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${prefix}.name`} className="text-xs">Name</Label>
          <Input
            id={`${prefix}.name`}
            placeholder="e.g. Ben"
            disabled={isDisabled}
            {...form.register(`${prefix}.name`)}
          />
          {getCharError(errors, index, 'name') && (
            <p className="text-sm text-red-600" role="alert">
              {getCharError(errors, index, 'name')}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${prefix}.age`} className="text-xs">Age</Label>
          <Input
            id={`${prefix}.age`}
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            placeholder="e.g. 6"
            disabled={isDisabled}
            {...form.register(`${prefix}.age`)}
          />
          {getCharError(errors, index, 'age') && (
            <p className="text-sm text-red-600" role="alert">
              {getCharError(errors, index, 'age')}
            </p>
          )}
        </div>
      </div>

      {/* Gender + Relationship row (only when 2+ characters) */}
      {showExtendedFields && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${prefix}.gender`} className="text-xs">Gender</Label>
            <select
              id={`${prefix}.gender`}
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDisabled}
              {...form.register(`${prefix}.gender`)}
            >
              <option value="">Select...</option>
              {genders.map((g) => (
                <option key={g} value={g}>
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </option>
              ))}
            </select>
            {getCharError(errors, index, 'gender') && (
              <p className="text-sm text-red-600" role="alert">
                {getCharError(errors, index, 'gender')}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor={`${prefix}.relationship`} className="text-xs">Relationship</Label>
            <select
              id={`${prefix}.relationship`}
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDisabled}
              {...form.register(`${prefix}.relationship`)}
            >
              <option value="">Select...</option>
              {relationships.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            {getCharError(errors, index, 'relationship') && (
              <p className="text-sm text-red-600" role="alert">
                {getCharError(errors, index, 'relationship')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
