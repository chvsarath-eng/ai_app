'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, ShieldCheck, Truck, Clock } from 'lucide-react'
import { useCheckoutStore } from '@/lib/checkout-store'
import { initializePaddle, openPaddleCheckout } from '@/lib/paddle'
import { createStorybookJob } from '@/lib/storybookApi'
import { trackEvent } from '@/lib/analytics'
import type { Theme, OutputType } from '@/types/storybook'

import { ShippingForm } from '@/components/checkout/shipping-form'
import { DeliveryOptions } from '@/components/checkout/delivery-options'
import { OrderSummary } from '@/components/checkout/order-summary'

// Shipping option from Lulu API
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
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([])
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null)
  const [shippingLoading, setShippingLoading] = useState(false)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [paymentProcessing, setPaymentProcessing] = useState(false)

  // Track last fetched address to prevent duplicate fetches
  const lastFetchedAddressRef = useRef<string>('')

  const isHardcover = store.outputType === 'LULU_BOOK'

  // Check if we have product data and initialize Paddle
  useEffect(() => {
    initializePaddle()

    // Small delay for hydration
    const timer = setTimeout(() => {
      if (!store.name || !store.outputType || !store.email) {
        router.push('/')
      } else {
        setIsLoading(false)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [store.name, store.outputType, router])

  // Fetch shipping options when address is complete
  const fetchShippingCost = useCallback(async () => {
    const { shippingName, shippingAddress1, shippingCity, shippingRegion, shippingPostalCode, shippingCountry } = store

    if (!shippingName || !shippingAddress1 || !shippingCity || !shippingRegion || !shippingPostalCode || !shippingCountry) {
      return
    }

    // Create address hash to check if it changed
    const addressHash = `${shippingName}|${shippingAddress1}|${shippingCity}|${shippingRegion}|${shippingPostalCode}|${shippingCountry}`

    // Skip if address hasn't changed
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

      // Add estimated delivery dates
      const optionsWithDates = data.shipping_options.map((opt: ShippingOption) => ({
        ...opt,
        estimatedDelivery: getEstimatedDelivery(opt.level)
      }))

      setShippingOptions(optionsWithDates)
      // Auto-select first (cheapest) option
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

  // Get estimated delivery date based on shipping level
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

    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${formatDate(minDate)} - ${formatDate(maxDate)}`
  }

  // Handle shipping option selection
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

  const canPlaceOrder = isHardcover
    ? Boolean(isAddressComplete && selectedShipping && store.email)
    : Boolean(store.outputType && store.imageFile && store.email)

  const handlePlaceOrder = async () => {
    if (!store.outputType || !store.imageFile || isSubmitting) return
    if (isHardcover && (!selectedShipping || !isAddressComplete)) return
    if (!store.email) {
      setCheckoutError('Please enter your email before checkout.')
      return
    }

    setIsSubmitting(true)
    setCheckoutError(null)

    const formData: Record<string, unknown> = {
      name: store.name,
      age: store.age,
      storyline: store.storyline,
      outputType: store.outputType
    }

    if (isHardcover && selectedShipping) {
      Object.assign(formData, {
        shippingName: store.shippingName,
        shippingPhone: store.shippingPhone,
        shippingAddress1: store.shippingAddress1,
        shippingAddress2: store.shippingAddress2,
        shippingCity: store.shippingCity,
        shippingRegion: store.shippingRegion,
        shippingPostalCode: store.shippingPostalCode,
        shippingCountry: store.shippingCountry,
        shippingLevel: selectedShipping.level,
        shippingCost: selectedShipping.shipping_cost,
        orderTotal: selectedShipping.total
      })
    }

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: store.email,
          outputType: store.outputType,
          formData
        })
      })

      const data = await response.json()
      if (!response.ok || !data?.checkout?.transactionId) {
        const message = data?.error || 'Failed to initialize checkout'
        throw new Error(message)
      }

      const { transactionId } = data.checkout

      trackEvent('checkout_opened', {
        output_type: store.outputType,
        transaction_id: transactionId,
        shipping_level: selectedShipping?.level
      })

      // Open Paddle checkout overlay with multi-page layout
      openPaddleCheckout(
        {
          transactionId,
          settings: {
            displayMode: 'overlay',
            theme: 'light',
            variant: 'multi-page',
            allowLogout: false
          }
        },
        {
          onSuccess: async (completedTransactionId) => {
            // Close Paddle overlay immediately to show our processing UI
            if (window.Paddle?.Checkout?.close) {
              window.Paddle.Checkout.close()
            }
            setPaymentProcessing(true)

            try {
              const shippingAddress = isHardcover
                ? {
                    fullName: store.shippingName,
                    line1: store.shippingAddress1,
                    line2: store.shippingAddress2 || undefined,
                    city: store.shippingCity,
                    region: store.shippingRegion,
                    postalCode: store.shippingPostalCode,
                    countryCode: store.shippingCountry
                  }
                : undefined

              const res = await createStorybookJob({
                imageFile: store.imageFile!,
                theme: 'Custom' as Theme,
                storyline: `Name: ${store.name}\nAge: ${store.age}\nStory: ${store.storyline}`,
                email: store.email || '',
                outputType: store.outputType as OutputType,
                shippingAddress
              })

              store.reset()
              router.push(`/order/${res.jobId}?tx=${completedTransactionId}`)
            } catch (err) {
              console.error('Failed to create job:', err)
              setPaymentProcessing(false)
              setIsSubmitting(false)
            }
          },
          onClose: () => {
            setIsSubmitting(false)
          }
        }
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize checkout'
      console.error(message, err)
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
        <p className="text-zinc-500 mt-2">Please wait while we create your storybook.</p>
      </div>
    )
  }

  return (
    <div className="py-6 sm:py-8 lg:py-10">
      {/* Page header - Centered */}
      <div className="mb-6 sm:mb-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold">
          <span className="ultraGlowText">Checkout</span>
        </h1>
        
        {/* Trust badges - desktop */}
        <div className="hidden sm:flex items-center justify-center gap-6 mt-3 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-violet-500" />
            <span>Secure Payment</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-violet-500" />
            <span>Fast Delivery</span>
          </div>
        </div>
      </div>

      {/* Trust badges - mobile */}
      <div className="flex sm:hidden items-center justify-center gap-4 text-xs text-zinc-500 mb-6">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-violet-600" />
          <span>Secure</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Truck className="h-4 w-4 text-violet-600" />
          <span>Fast Delivery</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-violet-600" />
          <span>24hr Support</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Error message */}
        {checkoutError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {checkoutError}
          </div>
        )}

        <div className="grid gap-6 lg:gap-8 lg:grid-cols-3">
          {/* Left Column - Forms */}
          <div className="lg:col-span-2 space-y-6">
            {/* Shipping Address - Only for hardcover */}
            {isHardcover && (
              <>
                <ShippingForm
                  store={store}
                  onAddressComplete={fetchShippingCost}
                  isSubmitting={isSubmitting || paymentProcessing}
                />

                {/* Delivery Options */}
                <DeliveryOptions
                  isAddressComplete={isAddressComplete}
                  shippingLoading={shippingLoading}
                  shippingError={shippingError}
                  shippingOptions={shippingOptions}
                  selectedShipping={selectedShipping}
                  onSelectShipping={handleSelectShipping}
                />
              </>
            )}

            {/* Digital book - simplified checkout */}
            {!isHardcover && (
              <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 mb-4">
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                  Ready to Order
                </h2>
                <div className="space-y-4">
                  <p className="text-sm text-zinc-600">
                    Your digital storybook will be delivered instantly to your email after purchase.
                  </p>
                  
                  {/* Email display */}
                  <div className="flex items-center gap-3 rounded-lg bg-zinc-50 px-4 py-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                      <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Delivery email</p>
                      <p className="text-sm font-medium text-zinc-900">{store.email}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-emerald-800">
                      <p className="font-medium">Secure Checkout</p>
                      <p className="text-emerald-700 mt-0.5">Your payment is processed securely by Paddle. Tax is calculated automatically.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Waiting for shipping selection message */}
            {isHardcover && !selectedShipping && !shippingLoading && isAddressComplete && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <Truck className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-amber-800">
                  Select a delivery option above to proceed to payment
                </p>
              </div>
            )}
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <OrderSummary
              store={store}
              selectedShipping={selectedShipping}
              isSubmitting={isSubmitting}
              canPlaceOrder={canPlaceOrder}
              onPlaceOrder={handlePlaceOrder}
            />
          </div>
        </div>

        {/* Bottom trust indicators */}
        <div className="mt-8 pt-6 border-t border-zinc-200">
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <span>Secure payments by Paddle</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span>Money-back guarantee</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
              </svg>
              <span>SSL encrypted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
