'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { ImageIcon, Wand2, Book, Sparkles } from 'lucide-react'

import { createStorybookJob } from '@/lib/storybookApi'
import { initializePaddle, openPaddleCheckout, getPriceIdForOutputType } from '@/lib/paddle'
import { useCheckoutStore } from '@/lib/checkout-store'
import { outputTypes } from '@/types/storybook'
import type { Theme, OutputType } from '@/types/storybook'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'
import { UploadDropzone } from '@/components/generator-card/upload-dropzone'
import { StorylineInput } from '@/components/generator-card/storyline-input'
import { GenerateButton } from '@/components/generator-card/generate-button'
import { PaymentSuccess } from '@/components/generator-card/payment-success'

const formSchema = z.object({
  imageFile: z.instanceof(File, { message: 'Please upload a photo' }),
  name: z.string().trim().min(1, 'Name is required').max(60, 'Keep it under 60 characters'),
  age: z.coerce.number().int().min(1, 'Enter a valid age').max(120, 'Enter a valid age'),
  storyline: z.string().trim().min(1, 'Storyline is required').max(180, 'Keep it under 180 characters'),
  outputType: z.enum(outputTypes, { message: 'Please select a book type' })
})

type FormInput = z.input<typeof formSchema>
type FormOutput = z.output<typeof formSchema>
type CreateJobResult = {
  jobId: string
  outputType: OutputType
  redirected: boolean
  transactionId?: string
}

function stitchPrompt (values: FormOutput) {
  // This is the text input your API receives
  return `Name: ${values.name}\nAge: ${values.age}\nStory: ${values.storyline}`.trim()
}

export function GeneratorCard ({ className }: { className?: string }) {
  const router = useRouter()
  const setProductInfo = useCheckoutStore((state) => state.setProductInfo)

  // Success state for inline payment confirmation
  const [successData, setSuccessData] = useState<{
    transactionId: string
    jobId: string
    outputType: OutputType
  } | null>(null)

  // Preview URL for uploaded image
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  // Initialize Paddle on mount
  useEffect(() => {
    initializePaddle()
  }, [])

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    mode: 'onSubmit',
    defaultValues: {
      name: '',
      age: undefined,
      storyline: '',
      outputType: undefined
    }
  })
  const storylineValue = form.watch('storyline')

  const createJobMutation = useMutation<CreateJobResult, Error, FormInput>({
    mutationFn: async (values: FormInput) => {
      const parsed = formSchema.parse(values)

      // Store product info and navigate to checkout page
      // Both digital and hardcover now go through checkout page with Paddle overlay

      setProductInfo({
        imageFile: parsed.imageFile,
        imagePreviewUrl: imagePreviewUrl || '',
        name: parsed.name,
        age: parsed.age,
        storyline: parsed.storyline,
        outputType: parsed.outputType as OutputType
      })

      trackEvent('checkout_started', {
        output_type: parsed.outputType
      })

      router.push('/checkout')
      return { jobId: '', outputType: parsed.outputType as OutputType, redirected: true }
    },
    onSuccess: (result) => {
      // Don't show success if redirected to checkout page
      if (result.redirected) return

      // Show inline success state instead of navigating
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

  // Show success state after payment
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
          Upload a photo, enter name + age, write a 1‑line storyline, and we’ll generate a full book with high‑resolution pages.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-4" aria-label="Storybook generator">
          <div className="space-y-2">
            <Label className="flex items-center gap-2" htmlFor="imageFile">
              <ImageIcon className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              Photo
            </Label>

            <Controller
              name="imageFile"
              control={form.control}
              render={({ field }) => (
                <UploadDropzone
                  value={field.value}
                  onChange={(file) => {
                    field.onChange(file)
                    // Create preview URL for checkout page
                    if (file) {
                      const url = URL.createObjectURL(file)
                      setImagePreviewUrl(url)
                    } else {
                      setImagePreviewUrl(null)
                    }
                  }}
                  isDisabled={createJobMutation.isPending}
                />
              )}
            />

            {form.formState.errors.imageFile?.message
              ? (
                <p className="text-sm text-red-600" role="alert">
                  {form.formState.errors.imageFile.message}
                </p>
              )
              : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. Ben"
                disabled={createJobMutation.isPending}
                {...form.register('name')}
              />
              {form.formState.errors.name?.message
                ? (
                  <p className="text-sm text-red-600" role="alert">
                    {form.formState.errors.name.message}
                  </p>
                )
                : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                disabled={createJobMutation.isPending}
                placeholder="e.g. 6"
                {...form.register('age')}
              />
              {form.formState.errors.age?.message
                ? (
                  <p className="text-sm text-red-600" role="alert">
                    {form.formState.errors.age.message}
                  </p>
                )
                : null}
            </div>
          </div>

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

          {storylineValue
            ? (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Book className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                  Book type
                </Label>
                <Controller
                  name="outputType"
                  control={form.control}
                  render={({ field }) => (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label
                        className={cn(
                          'relative flex cursor-pointer flex-col rounded-lg border-2 p-3 transition-all hover:border-violet-300',
                          field.value === 'DIGI_BOOK'
                            ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/20'
                            : 'border-zinc-200 bg-white'
                        )}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          value="DIGI_BOOK"
                          checked={field.value === 'DIGI_BOOK'}
                          onChange={() => field.onChange('DIGI_BOOK')}
                          disabled={createJobMutation.isPending}
                        />
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-violet-600" />
                          <span className="text-sm font-semibold text-zinc-900">Digital Book</span>
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500">HTML flipbook</p>
                        <p className="mt-1 text-base font-bold text-violet-600">$14.99</p>
                        {field.value === 'DIGI_BOOK' && (
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
                          field.value === 'LULU_BOOK'
                            ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                            : 'border-zinc-200 bg-white'
                        )}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          value="LULU_BOOK"
                          checked={field.value === 'LULU_BOOK'}
                          onChange={() => field.onChange('LULU_BOOK')}
                          disabled={createJobMutation.isPending}
                        />
                        <div className="flex items-center gap-1.5">
                          <Book className="h-4 w-4 text-emerald-600" />
                          <span className="text-sm font-semibold text-zinc-900">Hardcover</span>
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500">8.5×8.5" printed</p>
                        <p className="mt-1 text-base font-bold text-emerald-600">$39.99</p>
                        {field.value === 'LULU_BOOK' && (
                          <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                        )}
                      </label>
                    </div>
                  )}
                />
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
            hasPhoto={Boolean(form.watch('imageFile'))}
          />
        </form>
      </CardContent>
      </Card>
    </div>
  )
}

