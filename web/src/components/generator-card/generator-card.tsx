'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useFieldArray, FormProvider } from 'react-hook-form'
import { Wand2, Book, Sparkles, UserPlus } from 'lucide-react'

import { saveCheckoutFiles } from '@/lib/checkout-files'
import { useCheckoutStore } from '@/lib/checkout-store'
import { useFormDraftStore } from '@/lib/form-draft-store'
import type { CharacterDraft } from '@/lib/form-draft-store'
import { outputTypes } from '@/types/storybook'
import type { OutputType, CharacterInfo } from '@/types/storybook'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'
import { StorylineInput } from '@/components/generator-card/storyline-input'
import { GenerateButton } from '@/components/generator-card/generate-button'
import { PaymentSuccess } from '@/components/generator-card/payment-success'
import { CharacterCard } from '@/components/generator-card/character-card'

const characterSchema = z.object({
  imageFile: z.instanceof(File, { message: 'Please upload a photo' }),
  name: z.string().trim().min(1, 'Name is required').max(60, 'Keep it under 60 characters'),
  age: z.coerce.number().int().min(1, 'Enter a valid age').max(120, 'Enter a valid age'),
  gender: z.string().optional(),
  relationship: z.string().optional()
})

const formSchema = z.object({
  characters: z.array(characterSchema).min(1, 'At least one character is required').max(2, 'Maximum 2 characters on homepage'),
  storyline: z.string().trim().min(1, 'Storyline is required').max(180, 'Keep it under 180 characters'),
  outputType: z.enum(outputTypes, { message: 'Please select a book type' })
}).superRefine((data, ctx) => {
  if (data.characters.length > 1) {
    data.characters.forEach((char, i) => {
      if (!char.gender) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Gender is required',
          path: ['characters', i, 'gender']
        })
      }
      if (!char.relationship) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Relationship is required',
          path: ['characters', i, 'relationship']
        })
      }
    })
  }
})

type FormInput = z.input<typeof formSchema>
type CreateJobResult = {
  jobId: string
  outputType: OutputType
  redirected: boolean
  transactionId?: string
}

const defaultCharacter = {
  imageFile: undefined as unknown as File,
  name: '',
  age: undefined as unknown as number,
  gender: '',
  relationship: ''
}

export function GeneratorCard ({ className }: { className?: string }) {
  const router = useRouter()
  const setProductInfo = useCheckoutStore((state) => state.setProductInfo)
  const setDiscountCode = useCheckoutStore((state) => state.setDiscountCode)
  const { setDraft } = useFormDraftStore()

  const [successData, setSuccessData] = useState<{
    transactionId: string
    jobId: string
    outputType: OutputType
  } | null>(null)

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: {
      characters: [{ ...defaultCharacter }],
      storyline: '',
      outputType: undefined
    }
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'characters'
  })

  const storylineValue = form.watch('storyline')
  const characterCount = fields.length
  const showExtendedFields = characterCount > 1

  const createJobMutation = useMutation<CreateJobResult, Error, FormInput>({
    mutationFn: async (values: FormInput) => {
      const parsed = formSchema.parse(values)

      const imageFiles = parsed.characters.map((c) => c.imageFile)
      const imagePreviewUrls = imageFiles.map((f) => URL.createObjectURL(f))

      await saveCheckoutFiles(imageFiles)

      const characters: CharacterInfo[] = parsed.characters.map((c) => ({
        name: c.name,
        age: c.age,
        gender: (c.gender || 'other') as CharacterInfo['gender'],
        relationship: c.relationship || ''
      }))

      setProductInfo({
        imageFiles,
        imagePreviewUrls,
        characters,
        storyline: parsed.storyline,
        outputType: parsed.outputType as OutputType
      })

      trackEvent('checkout_started', {
        output_type: parsed.outputType,
        num_characters: parsed.characters.length
      })

      let incomingDiscountCode = ''
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        incomingDiscountCode = (params.get('discount') || params.get('coupon') || '').trim().toUpperCase()
      }
      setDiscountCode(incomingDiscountCode)

      router.push('/checkout')
      return { jobId: '', outputType: parsed.outputType as OutputType, redirected: true }
    },
    onSuccess: (result) => {
      if (result.redirected) return
      setSuccessData({
        transactionId: result.transactionId || '',
        jobId: result.jobId,
        outputType: result.outputType as OutputType
      })
    }
  })

  const onSubmit = form.handleSubmit((values) => createJobMutation.mutate(values))

  const formError = createJobMutation.error instanceof Error
    ? createJobMutation.error.message
    : null

  if (successData) {
    return (
      <div className={cn('siriAmbientCard', className)}>
        <PaymentSuccess
          transactionId={successData.transactionId}
          jobId={successData.jobId}
          outputType={successData.outputType}
          onCreateAnother={() => {
            setSuccessData(null)
            form.reset()
          }}
        />
      </div>
    )
  }

  const hasAnyPhoto = form.watch('characters')?.some((c) => c?.imageFile)

  return (
    <div className={cn('siriAmbientCard', className)}>
      <Card id="try" className="relative z-10 overflow-hidden">
      <CardHeader className="bg-gradient-to-b from-white to-transparent text-left">
          <CardTitle className="flex w-full items-center justify-start gap-1 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-transparent">
              <img
                src="/favicon.png"
                alt=""
                className="h-7 w-7"
                aria-hidden="true"
              />
            </span>
            <span className="mt-1">Generate your storybook</span>
          </CardTitle>
        <CardDescription className="sr-only">
          Upload photos, enter names + ages, write a 1-line storyline, and we'll generate a full book with high-resolution pages.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" aria-label="Storybook generator">
            {/* Character cards */}
            <div className="space-y-3">
              <div className={cn(
                'grid gap-3',
                characterCount > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
              )}>
                {fields.map((field, index) => (
                  <CharacterCard
                    key={field.id}
                    index={index}
                    showExtendedFields={showExtendedFields}
                    isDisabled={createJobMutation.isPending}
                    onRemove={index > 0 ? () => remove(index) : undefined}
                  />
                ))}
              </div>

              {/* Add Character button */}
              {characterCount < 2 && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed border-zinc-300 text-zinc-500 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50/50"
                  onClick={() => append({ ...defaultCharacter })}
                  disabled={createJobMutation.isPending}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add character ({characterCount}/2)
                </Button>
              )}

              {characterCount === 2 && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed border-violet-400 bg-gradient-to-r from-violet-50 to-fuchsia-50 text-violet-700 font-medium hover:border-violet-500 hover:from-violet-100 hover:to-fuchsia-100"
                  onClick={() => {
                    const currentValues = form.getValues()
                    const charactersWithPreviews: CharacterDraft[] = currentValues.characters.map(c => ({
                      imageFile: c.imageFile,
                      imagePreviewUrl: c.imageFile ? URL.createObjectURL(c.imageFile) : undefined,
                      name: c.name,
                      age: typeof c.age === 'number' ? c.age : undefined,
                      gender: c.gender || '',
                      relationship: c.relationship || ''
                    }))
                    
                    // Add a 3rd empty character so user sees the new slot immediately
                    charactersWithPreviews.push({
                      imageFile: undefined,
                      imagePreviewUrl: undefined,
                      name: '',
                      age: undefined,
                      gender: '',
                      relationship: ''
                    })
                    
                    setDraft({
                      characters: charactersWithPreviews,
                      storyline: currentValues.storyline,
                      outputType: currentValues.outputType
                    })
                    
                    router.push('/create')
                  }}
                  disabled={createJobMutation.isPending}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add more characters
                </Button>
              )}

              {characterCount < 2 && (
                <p className="text-center text-xs text-zinc-400">
                  Add a friend, sibling, or parent to the story
                </p>
              )}
              
              {characterCount === 2 && (
                <p className="text-center text-xs text-zinc-500">
                  Want to add 3-4 characters? Use our full creation page for more space
                </p>
              )}
            </div>

            {/* Storyline */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2" htmlFor="storyline">
                <Wand2 className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                Storyline
              </Label>
              <StorylineInput
                id="storyline"
                placeholder="e.g. A curious kid discovers a secret door to space…"
                isDisabled={createJobMutation.isPending}
                {...form.register('storyline')}
              />
              {form.formState.errors.storyline?.message
                ? (
                  <p className="text-sm text-red-600" role="alert">
                    {form.formState.errors.storyline.message}
                  </p>
                )
                : null}
            </div>

            {/* Book type */}
            {storylineValue
              ? (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Book className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                    Book type
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label
                      className={cn(
                        'relative flex cursor-pointer flex-col rounded-lg border-2 p-3 transition-all hover:border-violet-300',
                        form.watch('outputType') === 'DIGI_BOOK'
                          ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/20'
                          : 'border-zinc-200 bg-white'
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        value="DIGI_BOOK"
                        checked={form.watch('outputType') === 'DIGI_BOOK'}
                        onChange={() => form.setValue('outputType', 'DIGI_BOOK')}
                        disabled={createJobMutation.isPending}
                      />
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-violet-600" />
                        <span className="text-sm font-semibold text-zinc-900">Digital Book</span>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">HTML flipbook</p>
                      <p className="mt-1 text-base font-bold text-violet-600">$9.99</p>
                      {form.watch('outputType') === 'DIGI_BOOK' && (
                        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-white">
                          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </label>

                    <label
                      className={cn(
                        'relative flex cursor-pointer flex-col rounded-lg border-2 p-3 transition-all hover:border-emerald-300',
                        form.watch('outputType') === 'LULU_BOOK'
                          ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                          : 'border-zinc-200 bg-white'
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        value="LULU_BOOK"
                        checked={form.watch('outputType') === 'LULU_BOOK'}
                        onChange={() => form.setValue('outputType', 'LULU_BOOK')}
                        disabled={createJobMutation.isPending}
                      />
                      <div className="flex items-center gap-1.5">
                        <Book className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-semibold text-zinc-900">Hardcover</span>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">8.5×8.5" printed</p>
                      <p className="mt-1 text-base font-bold text-emerald-600">$39.99</p>
                      {form.watch('outputType') === 'LULU_BOOK' && (
                        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </label>
                  </div>
                  {form.formState.errors.outputType?.message
                    ? (
                      <p className="text-sm text-red-600" role="alert">
                        {form.formState.errors.outputType.message}
                      </p>
                    )
                    : null}
                </div>
                )
              : null}

            {formError
              ? (
                <p className="text-sm text-red-600" role="alert">
                  {formError}
                </p>
              )
              : null}

            <GenerateButton
              isLoading={createJobMutation.isPending}
              hasPhoto={Boolean(hasAnyPhoto)}
            />
          </form>
        </FormProvider>
      </CardContent>
      </Card>
    </div>
  )
}
