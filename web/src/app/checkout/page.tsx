'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard } from 'lucide-react'
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

  // Check if we have product data
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

      // Open Paddle checkout with the server-created transaction
      // The transaction already includes: items (product + shipping), customer email, address for tax
      openPaddleCheckout(
        {
          transactionId,
          settings: {
            displayMode: 'overlay',
            theme: 'light',
            variant: 'one-page',
            allowLogout: false
          }
        },
        {
          onSuccess: async (completedTransactionId) => {
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading checkout...</div>
      </div>
    )
  }

  if (paymentProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4" />
          <p className="text-zinc-600">Processing your order...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-8 text-2xl font-bold text-zinc-900">Checkout</h1>

        <div className="grid gap-8 lg:grid-cols-3">
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

            {!isHardcover && (
              <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 mb-3">
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                  Payment
                </h2>
                <p className="text-sm text-zinc-600">
                  Click Place Order to open secure Paddle checkout.
                </p>
              </div>
            )}

            {isHardcover && !selectedShipping && !shippingLoading && isAddressComplete && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center">
                <CreditCard className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">
                  Select a delivery option above to proceed to payment
                </p>
              </div>
            )}
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            {checkoutError
              ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {checkoutError}
                </div>
              )
              : null}
            <OrderSummary
              store={store}
              selectedShipping={selectedShipping}
              isSubmitting={isSubmitting}
              canPlaceOrder={canPlaceOrder}
              onPlaceOrder={handlePlaceOrder}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
