'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { ImageIcon, Mail, Wand2, Book, Sparkles } from 'lucide-react'

import { createStorybookJob } from '@/lib/storybookApi'
import { initializePaddle, openPaddleCheckout, getPriceIdForOutputType } from '@/lib/paddle'
import { outputTypes } from '@/types/storybook'
import type { Theme, OutputType } from '@/types/storybook'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'
import { UploadDropzone } from '@/components/generator-card/upload-dropzone'
import { StorylineInput } from '@/components/generator-card/storyline-input'
import { EmailInput } from '@/components/generator-card/email-input'
import { GenerateButton } from '@/components/generator-card/generate-button'
import { PaymentSuccess } from '@/components/generator-card/payment-success'

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'PT', name: 'Portugal' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' },
  { code: 'GR', name: 'Greece' },
  { code: 'TR', name: 'Turkey' },
  { code: 'IL', name: 'Israel' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'IN', name: 'India' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'MX', name: 'Mexico' },
  { code: 'BR', name: 'Brazil' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Peru' },
  { code: 'ZA', name: 'South Africa' }
]

const formSchema = z.object({
  imageFile: z.instanceof(File, { message: 'Please upload a photo' }),
  name: z.string().trim().min(1, 'Name is required').max(60, 'Keep it under 60 characters'),
  age: z.coerce.number().int().min(1, 'Enter a valid age').max(120, 'Enter a valid age'),
  storyline: z.string().trim().min(1, 'Storyline is required').max(180, 'Keep it under 180 characters'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  confirmEmail: z.string().trim().min(1, 'Please confirm your email').email('Enter a valid email'),
  outputType: z.enum(outputTypes, { message: 'Please select a book type' }),
  shippingName: z.string().trim().optional(),
  shippingAddress1: z.string().trim().optional(),
  shippingAddress2: z.string().trim().optional(),
  shippingCity: z.string().trim().optional(),
  shippingRegion: z.string().trim().optional(),
  shippingPostalCode: z.string().trim().optional(),
  shippingCountry: z.string().trim().optional()
}).superRefine((values, ctx) => {
  if (values.email !== values.confirmEmail) {
    ctx.addIssue({
      path: ['confirmEmail'],
      code: z.ZodIssueCode.custom,
      message: 'Emails do not match'
    })
  }

  if (values.outputType !== 'LULU_BOOK') return

  const requiredFields = [
    { key: 'shippingName', label: 'Full name' },
    { key: 'shippingAddress1', label: 'Street address' },
    { key: 'shippingCity', label: 'City' },
    { key: 'shippingRegion', label: 'State/Region' },
    { key: 'shippingPostalCode', label: 'ZIP/Postal code' },
    { key: 'shippingCountry', label: 'Country' }
  ] as const

  requiredFields.forEach(({ key, label }) => {
    const value = values[key]
    if (!value || value.trim().length === 0) {
      ctx.addIssue({
        path: [key],
        code: z.ZodIssueCode.custom,
        message: `${label} is required`
      })
    }
  })

  if (values.shippingCountry && values.shippingCountry.length !== 2) {
    ctx.addIssue({
      path: ['shippingCountry'],
      code: z.ZodIssueCode.custom,
      message: 'Select a valid country'
    })
  }
})

type FormInput = z.input<typeof formSchema>
type FormOutput = z.output<typeof formSchema>

function stitchPrompt (values: FormOutput) {
  // This is the text input your API receives
  return `Name: ${values.name}\nAge: ${values.age}\nStory: ${values.storyline}`.trim()
}

export function GeneratorCard ({ className }: { className?: string }) {
  // Success state for inline payment confirmation
  const [successData, setSuccessData] = useState<{
    transactionId: string
    jobId: string
    outputType: OutputType
  } | null>(null)

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
      email: '',
      confirmEmail: '',
      outputType: undefined,
      shippingName: '',
      shippingAddress1: '',
      shippingAddress2: '',
      shippingCity: '',
      shippingRegion: '',
      shippingPostalCode: '',
      shippingCountry: ''
    }
  })
  const emailValue = form.watch('email')
  const confirmEmailValue = form.watch('confirmEmail')
  const outputTypeValue = form.watch('outputType')
  const requiresShipping = outputTypeValue === 'LULU_BOOK'

  const createJobMutation = useMutation({
    mutationFn: async (values: FormInput) => {
      const parsed = formSchema.parse(values)
      const priceId = getPriceIdForOutputType(parsed.outputType as OutputType)
      const shippingAddress = parsed.outputType === 'LULU_BOOK'
        ? {
            fullName: parsed.shippingName?.trim() ?? '',
            line1: parsed.shippingAddress1?.trim() ?? '',
            line2: parsed.shippingAddress2?.trim() || undefined,
            city: parsed.shippingCity?.trim() ?? '',
            region: parsed.shippingRegion?.trim() ?? '',
            postalCode: parsed.shippingPostalCode?.trim() ?? '',
            countryCode: parsed.shippingCountry?.trim().toUpperCase() ?? ''
          }
        : undefined

      trackEvent('checkout_opened', {
        output_type: parsed.outputType,
        price_id: priceId
      })

      const customData: Record<string, string> = {
        name: parsed.name,
        age: parsed.age.toString(),
        storyline: parsed.storyline,
        outputType: parsed.outputType
      }

      if (shippingAddress) {
        customData.shippingName = shippingAddress.fullName
        customData.shippingAddress1 = shippingAddress.line1
        if (shippingAddress.line2) customData.shippingAddress2 = shippingAddress.line2
        customData.shippingCity = shippingAddress.city
        customData.shippingRegion = shippingAddress.region
        customData.shippingPostalCode = shippingAddress.postalCode
        customData.shippingCountry = shippingAddress.countryCode
      }

      return new Promise<{ jobId: string, outputType: string, transactionId?: string }>((resolve, reject) => {
        openPaddleCheckout(
          {
            items: [{ priceId, quantity: 1 }],
            customer: shippingAddress
              ? {
                  email: parsed.email,
                  address: {
                    countryCode: shippingAddress.countryCode,
                    postalCode: shippingAddress.postalCode,
                    region: shippingAddress.region,
                    city: shippingAddress.city,
                    line1: shippingAddress.line1,
                    line2: shippingAddress.line2
                  }
                }
              : { email: parsed.email },
            customData,
            settings: {
              displayMode: 'overlay',
              theme: 'light'
            }
          },
          {
            onSuccess: async (transactionId) => {
              console.log('Payment successful, transaction:', transactionId)
              // Only create job after payment succeeds
              try {
                const res = await createStorybookJob({
                  imageFile: parsed.imageFile,
                  theme: 'Custom' as Theme,
                  storyline: stitchPrompt(parsed),
                  email: parsed.email,
                  outputType: parsed.outputType as OutputType,
                  shippingAddress
                })
                resolve({ ...res, outputType: parsed.outputType, transactionId })
              } catch (err) {
                reject(err)
              }
            },
            onClose: () => {
              // User closed checkout without completing
              reject(new Error('Checkout cancelled'))
            }
          }
        )
      })
    },
    onSuccess: ({ jobId, outputType, transactionId }) => {
      // Show inline success state instead of navigating
      setSuccessData({
        transactionId: transactionId || '',
        jobId,
        outputType: outputType as OutputType
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

      <CardContent className="space-y-5">
        <form onSubmit={onSubmit} className="space-y-5" aria-label="Storybook generator">
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
                  onChange={(file) => field.onChange(file)}
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

          <div className="space-y-2">
            <Label className="flex items-center gap-2" htmlFor="email">
              <Mail className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              Email
            </Label>
            <EmailInput
              id="email"
              placeholder="you@domain.com"
              autoComplete="email"
              isDisabled={createJobMutation.isPending}
              {...form.register('email')}
            />
            {form.formState.errors.email?.message
              ? (
                <p className="text-sm text-red-600" role="alert">
                  {form.formState.errors.email.message}
                </p>
              )
              : null}
          </div>

          {emailValue
            ? (
              <div className="space-y-2">
                <Label className="flex items-center gap-2" htmlFor="confirmEmail">
                  <Mail className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                  Confirm email
                </Label>
                <EmailInput
                  id="confirmEmail"
                  placeholder="Re-enter your email"
                  autoComplete="email"
                  isDisabled={createJobMutation.isPending}
                  {...form.register('confirmEmail')}
                />
                {form.formState.errors.confirmEmail?.message
                  ? (
                    <p className="text-sm text-red-600" role="alert">
                      {form.formState.errors.confirmEmail.message}
                    </p>
                  )
                  : null}
              </div>
              )
            : null}

          {confirmEmailValue
            ? (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Book className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                  Choose your book type
                </Label>
                <Controller
                  name="outputType"
                  control={form.control}
                  render={({ field }) => (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label
                        className={cn(
                          'relative flex cursor-pointer flex-col rounded-xl border-2 p-4 transition-all hover:border-violet-300',
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
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-violet-600" />
                          <span className="font-semibold text-zinc-900">Digital Book</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600">Interactive HTML flipbook</p>
                        <p className="mt-2 text-lg font-bold text-violet-600">$14.99</p>
                        {field.value === 'DIGI_BOOK' && (
                          <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white">
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                        )}
                      </label>

                      <label
                        className={cn(
                          'relative flex cursor-pointer flex-col rounded-xl border-2 p-4 transition-all hover:border-emerald-300',
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
                        <div className="flex items-center gap-2">
                          <Book className="h-5 w-5 text-emerald-600" />
                          <span className="font-semibold text-zinc-900">Premium Hardcover</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600">8.5×8.5" printed book</p>
                        <p className="mt-2 text-lg font-bold text-emerald-600">$39.99</p>
                        {field.value === 'LULU_BOOK' && (
                          <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
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
                <p className="text-xs text-zinc-500">Tax calculated at checkout.</p>
              </div>
              )
            : null}

          {requiresShipping
            ? (
              <div className="space-y-4 rounded-xl border border-zinc-200/70 bg-zinc-50/40 p-4">
                <h4 className="text-sm font-semibold text-zinc-900">Shipping details</h4>
                <div className="space-y-2">
                  <Label htmlFor="shippingName">Full name</Label>
                  <Input
                    id="shippingName"
                    placeholder="Full name"
                    autoComplete="name"
                    disabled={createJobMutation.isPending}
                    {...form.register('shippingName')}
                  />
                  {form.formState.errors.shippingName?.message
                    ? (
                      <p className="text-sm text-red-600" role="alert">
                        {form.formState.errors.shippingName.message}
                      </p>
                    )
                    : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shippingAddress1">Street address</Label>
                  <Input
                    id="shippingAddress1"
                    placeholder="Street address"
                    autoComplete="address-line1"
                    disabled={createJobMutation.isPending}
                    {...form.register('shippingAddress1')}
                  />
                  {form.formState.errors.shippingAddress1?.message
                    ? (
                      <p className="text-sm text-red-600" role="alert">
                        {form.formState.errors.shippingAddress1.message}
                      </p>
                    )
                    : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shippingAddress2">Address line 2 (optional)</Label>
                  <Input
                    id="shippingAddress2"
                    placeholder="Apt, suite, unit, etc."
                    autoComplete="address-line2"
                    disabled={createJobMutation.isPending}
                    {...form.register('shippingAddress2')}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="shippingCity">City</Label>
                    <Input
                      id="shippingCity"
                      placeholder="City"
                      autoComplete="address-level2"
                      disabled={createJobMutation.isPending}
                      {...form.register('shippingCity')}
                    />
                    {form.formState.errors.shippingCity?.message
                      ? (
                        <p className="text-sm text-red-600" role="alert">
                          {form.formState.errors.shippingCity.message}
                        </p>
                      )
                      : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shippingRegion">State/Region</Label>
                    <Input
                      id="shippingRegion"
                      placeholder="State or region"
                      autoComplete="address-level1"
                      disabled={createJobMutation.isPending}
                      {...form.register('shippingRegion')}
                    />
                    {form.formState.errors.shippingRegion?.message
                      ? (
                        <p className="text-sm text-red-600" role="alert">
                          {form.formState.errors.shippingRegion.message}
                        </p>
                      )
                      : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="shippingPostalCode">ZIP/Postal code</Label>
                    <Input
                      id="shippingPostalCode"
                      placeholder="ZIP/Postal code"
                      autoComplete="postal-code"
                      disabled={createJobMutation.isPending}
                      {...form.register('shippingPostalCode')}
                    />
                    {form.formState.errors.shippingPostalCode?.message
                      ? (
                        <p className="text-sm text-red-600" role="alert">
                          {form.formState.errors.shippingPostalCode.message}
                        </p>
                      )
                      : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shippingCountry">Country</Label>
                    <select
                      id="shippingCountry"
                      autoComplete="country"
                      disabled={createJobMutation.isPending}
                      className="flex h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      {...form.register('shippingCountry')}
                    >
                      <option value="">Select a country</option>
                      {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                    {form.formState.errors.shippingCountry?.message
                      ? (
                        <p className="text-sm text-red-600" role="alert">
                          {form.formState.errors.shippingCountry.message}
                        </p>
                      )
                      : null}
                  </div>
                </div>
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

