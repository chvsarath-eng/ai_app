'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, ShieldCheck, Truck } from 'lucide-react'
import { useCheckoutStore } from '@/lib/checkout-store'
import { clearCheckoutFiles, loadCheckoutFiles, saveCheckoutFiles } from '@/lib/checkout-files'
import { createStorybookJob } from '@/lib/storybookApi'
import { trackEvent } from '@/lib/analytics'
import type { OutputType } from '@/types/storybook'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShippingForm } from '@/components/checkout/shipping-form'
import { DeliveryOptions } from '@/components/checkout/delivery-options'
import { OrderSummary } from '@/components/checkout/order-summary'

export interface ShippingOption {
  level: string
  description: string
  shipping_cost: number
  book_price: number
  total: number
  currency: string
  estimatedDelivery?: string
}

export default function CheckoutPage () {
  const router = useRouter()
  const store = useCheckoutStore()

  const [isLoading, setIsLoading] = useState(true)
  const [filesReady, setFilesReady] = useState(false)
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([])
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null)
  const [shippingLoading, setShippingLoading] = useState(false)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [urlDiscountCode, setUrlDiscountCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [paymentProcessing, setPaymentProcessing] = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [likenessPermission, setLikenessPermission] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const lastFetchedAddressRef = useRef<string>('')
  const hasHandledReturnRef = useRef(false)

  const isHardcover = store.outputType === 'LULU_BOOK'

  useEffect(() => {
    let isCancelled = false

    async function restoreFiles () {
      if (store.imageFiles.length > 0) {
        setFilesReady(true)
        return
      }

      try {
        const restoredFiles = await loadCheckoutFiles()
        if (!isCancelled && restoredFiles.length > 0) {
          store.restoreImageFiles(
            restoredFiles,
            restoredFiles.map((file) => URL.createObjectURL(file))
          )
        }
      } catch (error) {
        console.error('Failed to restore checkout files:', error)
      } finally {
        if (!isCancelled) {
          setFilesReady(true)
        }
      }
    }

    void restoreFiles()

    return () => {
      isCancelled = true
    }
  }, [store])

  useEffect(() => {
    if (!filesReady) return

    const timer = setTimeout(() => {
      if (paymentProcessing || isSubmitting) {
        setIsLoading(false)
        return
      }

      if (!store.characters?.[0]?.name || !store.outputType) {
        router.push('/')
        return
      }

      if (store.imageFiles.length === 0 && !store.pendingCheckoutSessionId) {
        router.push('/')
        return
      }

      setIsLoading(false)
    }, 100)

    return () => clearTimeout(timer)
  }, [
    filesReady,
    isSubmitting,
    paymentProcessing,
    router,
    store.characters,
    store.imageFiles.length,
    store.outputType,
    store.pendingCheckoutSessionId
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const incoming = (params.get('discount') || params.get('coupon') || '').trim().toUpperCase()
    setUrlDiscountCode(incoming)

    if (params.get('payment_cancelled') === '1') {
      setCheckoutError('Checkout was cancelled. You can review your details and try again.')
    }
  }, [])

  useEffect(() => {
    if (!urlDiscountCode) return
    if (store.discountCode === urlDiscountCode) return
    store.setDiscountCode(urlDiscountCode)
  }, [store, store.discountCode, urlDiscountCode])

  const fetchShippingCost = useCallback(async () => {
    const { shippingName, shippingAddress1, shippingCity, shippingRegion, shippingPostalCode, shippingCountry } = store

    if (!shippingName || !shippingAddress1 || !shippingCity || !shippingRegion || !shippingPostalCode || !shippingCountry) {
      return
    }

    const addressHash = `${shippingName}|${shippingAddress1}|${shippingCity}|${shippingRegion}|${shippingPostalCode}|${shippingCountry}`
    if (addressHash === lastFetchedAddressRef.current) {
      return
    }

    lastFetchedAddressRef.current = addressHash
    setShippingLoading(true)
    setShippingError(null)

    try {
      const response = await fetch('/api/lulu/shipping-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipping_address: {
            name: shippingName,
            street1: shippingAddress1,
            street2: store.shippingAddress2 || '',
            city: shippingCity,
            state_code: shippingRegion,
            postcode: shippingPostalCode,
            country_code: shippingCountry
          },
          quantity: 1
        })
      })

      const data = await response.json()

      if (!data.valid) {
        setShippingError(data.errors?.join(', ') || 'Invalid shipping address. Please check your details.')
        return
      }

      const optionsWithDates = data.shipping_options.map((opt: ShippingOption) => ({
        ...opt,
        estimatedDelivery: getEstimatedDelivery(opt.level)
      }))

      setShippingOptions(optionsWithDates)
      if (optionsWithDates.length > 0) {
        setSelectedShipping(optionsWithDates[0])
        store.setShippingOption(optionsWithDates[0].level, optionsWithDates[0].shipping_cost)
      }
    } catch (err) {
      console.error('Failed to fetch shipping cost:', err)
      setShippingError('Failed to calculate shipping. Please try again.')
    } finally {
      setShippingLoading(false)
    }
  }, [store])

  function getEstimatedDelivery (level: string): string {
    const today = new Date()
    let minDays = 7
    let maxDays = 21

    switch (level) {
      case 'MAIL':
        minDays = 7
        maxDays = 21
        break
      case 'GROUND_HD':
      case 'GROUND_BUS':
      case 'GROUND':
        minDays = 5
        maxDays = 10
        break
      case 'PRIORITY_MAIL':
        minDays = 3
        maxDays = 7
        break
      case 'EXPEDITED':
        minDays = 3
        maxDays = 5
        break
      case 'EXPRESS':
        minDays = 1
        maxDays = 3
        break
    }

    const minDate = new Date(today)
    minDate.setDate(today.getDate() + minDays)
    const maxDate = new Date(today)
    maxDate.setDate(today.getDate() + maxDays)

    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${formatDate(minDate)} - ${formatDate(maxDate)}`
  }

  const handleSelectShipping = (option: ShippingOption) => {
    setSelectedShipping(option)
    store.setShippingOption(option.level, option.shipping_cost)
  }

  const isAddressComplete = Boolean(
    store.shippingName &&
    store.shippingAddress1 &&
    store.shippingCity &&
    store.shippingRegion &&
    store.shippingPostalCode &&
    store.shippingCountry
  )

  const hasCustomerEmail = /\S+@\S+\.\S+/.test(store.email)
  const hasConsents = ageConfirmed && likenessPermission && termsAccepted
  const canPlaceOrder = Boolean(
    store.outputType &&
    store.imageFiles.length > 0 &&
    hasCustomerEmail &&
    hasConsents &&
    (isHardcover ? isAddressComplete && selectedShipping : true)
  )

  const handleCheckoutSuccess = useCallback(async (paymentId: string, customerEmail?: string | null) => {
    setPaymentProcessing(true)
    setCheckoutError(null)

    try {
      if (store.imageFiles.length === 0) {
        throw new Error('Your uploaded photos could not be restored after payment. Please try again.')
      }

      const outputType = store.outputType as OutputType
      const shippingAddress = outputType === 'LULU_BOOK'
        ? {
            fullName: store.shippingName,
            phone: store.shippingPhone || undefined,
            line1: store.shippingAddress1,
            line2: store.shippingAddress2 || undefined,
            city: store.shippingCity,
            region: store.shippingRegion,
            postalCode: store.shippingPostalCode,
            countryCode: store.shippingCountry
          }
        : undefined

      const res = await createStorybookJob({
        imageFiles: store.imageFiles,
        characters: store.characters,
        storyline: store.storyline,
        email: customerEmail || store.email || '',
        outputType,
        shippingAddress
      })

      trackEvent('checkout_completed', {
        payment_id: paymentId,
        output_type: outputType,
        checkout_provider: 'stripe'
      })

      store.clearPendingCheckout()
      await clearCheckoutFiles()
      store.reset()
      router.push(`/order/${res.jobId}?type=${outputType}&payment=${paymentId}`)
    } catch (error) {
      console.error('Failed to create job after payment:', error)
      setPaymentProcessing(false)
      setIsSubmitting(false)
      setCheckoutError(error instanceof Error ? error.message : 'Failed to create your storybook after payment')
    }
  }, [router, store])

  const verifyReturnedCheckout = useCallback(async (sessionId: string) => {
    setPaymentProcessing(true)
    setCheckoutError(null)

    try {
      const response = await fetch(`/api/checkout?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'GET',
        cache: 'no-store'
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to verify payment')
      }

      const status = data?.checkout?.status
      const paymentId = data?.checkout?.paymentId
      const customerEmail = data?.checkout?.customerEmail || null

      if (status === 'succeeded' && paymentId) {
        await handleCheckoutSuccess(paymentId, customerEmail)
        return
      }

      store.clearPendingCheckout()
      setPaymentProcessing(false)
      setIsSubmitting(false)

      if (status === 'processing') {
        setCheckoutError('Your payment is still processing. Please refresh this page in a moment.')
      } else if (status === 'failed' || status === 'cancelled') {
        setCheckoutError('Your payment was not completed. You can review your details and try again.')
      } else {
        setCheckoutError('Your payment was not completed yet. Please try again.')
      }

      router.replace('/checkout')
    } catch (error) {
      console.error('Failed to verify returned checkout:', error)
      setPaymentProcessing(false)
      setIsSubmitting(false)
      setCheckoutError(error instanceof Error ? error.message : 'Failed to verify payment')
    }
  }, [handleCheckoutSuccess, router, store])

  useEffect(() => {
    if (!filesReady || typeof window === 'undefined') return
    if (hasHandledReturnRef.current) return

    const params = new URLSearchParams(window.location.search)
    if (params.get('payment_return') !== '1') return

    hasHandledReturnRef.current = true

    const sessionId = params.get('session_id') || store.pendingCheckoutSessionId
    if (!sessionId) {
      setCheckoutError('We could not find your pending checkout session. Please contact support if you were charged.')
      setIsLoading(false)
      return
    }

    store.setPendingCheckout(sessionId)
    void verifyReturnedCheckout(sessionId)
  }, [filesReady, store, verifyReturnedCheckout])

  const handlePlaceOrder = async () => {
    if (!store.outputType || store.imageFiles.length === 0 || isSubmitting) return
    if (isHardcover && (!selectedShipping || !isAddressComplete)) return
    if (!hasCustomerEmail) {
      setCheckoutError('Enter a valid email address so we can send the finished storybook.')
      return
    }
    if (!hasConsents) {
      setCheckoutError('Please confirm age, photo permission, and Terms before paying.')
      return
    }

    setIsSubmitting(true)
    setCheckoutError(null)

    try {
      await saveCheckoutFiles(store.imageFiles)

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: store.email,
          outputType: store.outputType,
          discountCode: store.discountCode || undefined,
          consents: {
            ageConfirmed,
            likenessPermission,
            termsAccepted
          },
          formData: {
            characters: store.characters,
            storyline: store.storyline,
            numCharacters: store.characters.length,
            shippingName: store.shippingName,
            shippingPhone: store.shippingPhone,
            shippingAddress1: store.shippingAddress1,
            shippingAddress2: store.shippingAddress2,
            shippingCity: store.shippingCity,
            shippingRegion: store.shippingRegion,
            shippingPostalCode: store.shippingPostalCode,
            shippingCountry: store.shippingCountry,
            shippingLevel: store.selectedShippingLevel || undefined,
            shippingCost: store.shippingCost,
            orderTotal: selectedShipping?.total
          }
        })
      })

      const data = await response.json()
      if (!response.ok || !data?.checkout?.checkoutUrl || !data?.checkout?.sessionId) {
        throw new Error(data?.error || 'Failed to start Stripe checkout')
      }

      store.setPendingCheckout(data.checkout.sessionId)
      trackEvent('checkout_started', {
        output_type: store.outputType,
        checkout_provider: 'stripe'
      })

      window.location.href = data.checkout.checkoutUrl
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start checkout'
      console.error(message, error)
      setCheckoutError(message)
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent mx-auto mb-4" />
          <p className="text-zinc-500">Loading checkout...</p>
        </div>
      </div>
    )
  }

  if (paymentProcessing) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-violet-500 border-t-transparent rounded-full mb-4" />
        <h2 className="text-xl font-semibold text-zinc-900">Processing your order...</h2>
        <p className="text-zinc-500 mt-2">Please wait while we verify your payment and create your storybook.</p>
      </div>
    )
  }

  return (
    <div className="py-6 sm:py-8">
      <div className={`mx-auto px-4 sm:px-6 ${isHardcover ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <div className="mx-auto mb-6 max-w-3xl text-center sm:mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Checkout
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-600 sm:text-base">
            Secure international checkout powered by Stripe. Tax is calculated for your country at payment.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-xs text-zinc-600 sm:gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-violet-500" />
              <span>Stripe secure pay</span>
            </div>
            {isHardcover && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5">
                <Truck className="h-3.5 w-3.5 text-violet-500" />
                <span>Worldwide shipping</span>
              </div>
            )}
          </div>
        </div>

        {checkoutError && (
          <div className="mb-6 rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">
            {checkoutError}
          </div>
        )}

        <div className={isHardcover ? 'grid gap-4 lg:grid-cols-3 lg:gap-6' : 'mx-auto max-w-xl'}>
          {isHardcover && (
            <div className="space-y-4 lg:col-span-2">
              <ContactAndConsentForm
                email={store.email}
                isSubmitting={isSubmitting || paymentProcessing}
                ageConfirmed={ageConfirmed}
                likenessPermission={likenessPermission}
                termsAccepted={termsAccepted}
                onEmailChange={store.setEmail}
                onAgeConfirmedChange={setAgeConfirmed}
                onLikenessPermissionChange={setLikenessPermission}
                onTermsAcceptedChange={setTermsAccepted}
              />
              <ShippingForm
                store={store}
                onAddressComplete={fetchShippingCost}
                isSubmitting={isSubmitting || paymentProcessing}
              />
              <DeliveryOptions
                isAddressComplete={isAddressComplete}
                shippingLoading={shippingLoading}
                shippingError={shippingError}
                shippingOptions={shippingOptions}
                selectedShipping={selectedShipping}
                onSelectShipping={handleSelectShipping}
              />

              {!selectedShipping && !shippingLoading && isAddressComplete && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-center">
                  <Truck className="mx-auto mb-2 h-8 w-8 text-violet-500" />
                  <p className="text-sm font-medium text-zinc-900">
                    Select a delivery option to continue
                  </p>
                </div>
              )}
            </div>
          )}

          <div className={isHardcover ? 'lg:col-span-1' : ''}>
            <div className={isHardcover ? 'lg:sticky lg:top-24' : ''}>
              {!isHardcover && (
                <div className="mb-4">
                  <ContactAndConsentForm
                    email={store.email}
                    isSubmitting={isSubmitting || paymentProcessing}
                    ageConfirmed={ageConfirmed}
                    likenessPermission={likenessPermission}
                    termsAccepted={termsAccepted}
                    onEmailChange={store.setEmail}
                    onAgeConfirmedChange={setAgeConfirmed}
                    onLikenessPermissionChange={setLikenessPermission}
                    onTermsAcceptedChange={setTermsAccepted}
                  />
                </div>
              )}
              <OrderSummary
                store={store}
                selectedShipping={selectedShipping}
                isSubmitting={isSubmitting}
                isCheckoutOpen={false}
                canPlaceOrder={canPlaceOrder}
                ctaLabel="Pay with Stripe"
                submittingLabel="Redirecting to Stripe..."
                onPlaceOrder={handlePlaceOrder}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ContactAndConsentForm ({
  email,
  isSubmitting,
  ageConfirmed,
  likenessPermission,
  termsAccepted,
  onEmailChange,
  onAgeConfirmedChange,
  onLikenessPermissionChange,
  onTermsAcceptedChange
}: {
  email: string
  isSubmitting: boolean
  ageConfirmed: boolean
  likenessPermission: boolean
  termsAccepted: boolean
  onEmailChange: (email: string) => void
  onAgeConfirmedChange: (value: boolean) => void
  onLikenessPermissionChange: (value: boolean) => void
  onTermsAcceptedChange: (value: boolean) => void
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <Mail className="h-5 w-5 text-violet-600" />
          Contact &amp; Consent
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          We&apos;ll send the finished storybook to this email.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="checkoutEmail">
            Email address <span className="text-red-500">*</span>
          </Label>
          <Input
            id="checkoutEmail"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            disabled={isSubmitting}
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="border-zinc-200 bg-white focus-visible:ring-violet-500 focus-visible:ring-offset-white"
          />
        </div>

        <label className="flex items-start gap-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={ageConfirmed}
            disabled={isSubmitting}
            onChange={(event) => onAgeConfirmedChange(event.target.checked)}
          />
          <span>I confirm I am at least 18 years old.</span>
        </label>

        <label className="flex items-start gap-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={likenessPermission}
            disabled={isSubmitting}
            onChange={(event) => onLikenessPermissionChange(event.target.checked)}
          />
          <span>
            I own these photos or have permission to use them, including parental/guardian permission for any minors shown.
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={termsAccepted}
            disabled={isSubmitting}
            onChange={(event) => onTermsAcceptedChange(event.target.checked)}
          />
          <span>
            I agree to the{' '}
            <a href="/terms" className="text-violet-600 underline" target="_blank" rel="noreferrer">Terms</a>
            {' '}and{' '}
            <a href="/refund" className="text-violet-600 underline" target="_blank" rel="noreferrer">Refund Policy</a>.
          </span>
        </label>
      </div>
    </div>
  )
}
