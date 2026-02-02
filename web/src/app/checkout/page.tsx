'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard } from 'lucide-react'
import { useCheckoutStore } from '@/lib/checkout-store'
import { initializePaddle, openInlineCheckout, getPriceIdForOutputType } from '@/lib/paddle'
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
  const [checkoutReady, setCheckoutReady] = useState(false)
  const [paymentProcessing, setPaymentProcessing] = useState(false)

  // Track last fetched address to prevent duplicate fetches
  const lastFetchedAddressRef = useRef<string>('')
  const checkoutInitializedRef = useRef(false)

  const isHardcover = store.outputType === 'LULU_BOOK'

  // Check if we have product data
  useEffect(() => {
    // Small delay for hydration
    const timer = setTimeout(() => {
      if (!store.name || !store.outputType) {
        router.push('/')
      } else {
        setIsLoading(false)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [store.name, store.outputType, router])

  // Initialize Paddle checkout when ready
  useEffect(() => {
    if (isLoading || checkoutInitializedRef.current) return

    // For digital books, show checkout immediately
    // For hardcover, wait until shipping is selected
    const shouldInitCheckout = !isHardcover || (isHardcover && selectedShipping)

    if (shouldInitCheckout && !checkoutInitializedRef.current) {
      initializeCheckout()
    }
  }, [isLoading, isHardcover, selectedShipping])

  const initializeCheckout = () => {
    if (checkoutInitializedRef.current) return
    checkoutInitializedRef.current = true

    const priceId = getPriceIdForOutputType(store.outputType as OutputType)

    // Build custom data
    const customData: Record<string, string> = {
      name: store.name,
      age: store.age.toString(),
      storyline: store.storyline,
      outputType: store.outputType || ''
    }

    // Add shipping info for hardcover
    if (isHardcover && selectedShipping) {
      customData.shippingName = store.shippingName
      customData.shippingAddress1 = store.shippingAddress1
      if (store.shippingAddress2) customData.shippingAddress2 = store.shippingAddress2
      customData.shippingCity = store.shippingCity
      customData.shippingRegion = store.shippingRegion
      customData.shippingPostalCode = store.shippingPostalCode
      customData.shippingCountry = store.shippingCountry
      customData.shippingLevel = selectedShipping.level
      customData.shippingCost = selectedShipping.shipping_cost.toString()
      customData.orderTotal = selectedShipping.total.toString()
    }

    // Customer address for pre-fill (hardcover only)
    const customerAddress = isHardcover && store.shippingCountry
      ? {
          countryCode: store.shippingCountry,
          postalCode: store.shippingPostalCode,
          region: store.shippingRegion,
          city: store.shippingCity,
          line1: store.shippingAddress1,
          line2: store.shippingAddress2 || undefined
        }
      : undefined

    trackEvent('checkout_opened', {
      output_type: store.outputType,
      price_id: priceId
    })

    initializePaddle({
      onSuccess: async (transactionId) => {
        console.log('Payment successful, transaction:', transactionId)
        setPaymentProcessing(true)

        try {
          // Build shipping address for hardcover
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
            email: '', // Email comes from Paddle transaction
            outputType: store.outputType as OutputType,
            shippingAddress
          })

          // Clear store and redirect to success
          store.reset()
          router.push(`/order/${res.jobId}?tx=${transactionId}`)
        } catch (err) {
          console.error('Failed to create job:', err)
          setPaymentProcessing(false)
        }
      },
      onClose: () => {
        // User closed without completing - allow re-init
        checkoutInitializedRef.current = false
      }
    })

    openInlineCheckout({
      frameTarget: 'paddle-checkout-container',
      items: [{ priceId, quantity: 1 }],
      customer: customerAddress ? { address: customerAddress } : undefined,
      customData
    })

    setCheckoutReady(true)
  }

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

    // Reset checkout when address changes
    checkoutInitializedRef.current = false
    setCheckoutReady(false)

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
    // Reset checkout to reinitialize with new shipping
    checkoutInitializedRef.current = false
    setCheckoutReady(false)
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

  const isAddressComplete = Boolean(
    store.shippingName &&
    store.shippingAddress1 &&
    store.shippingCity &&
    store.shippingRegion &&
    store.shippingPostalCode &&
    store.shippingCountry
  )

  // For digital books, show checkout immediately
  // For hardcover, show checkout only after shipping is selected
  const showPaddleCheckout = !isHardcover || (isHardcover && selectedShipping)

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
                  isSubmitting={paymentProcessing}
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

            {/* Paddle Inline Checkout */}
            {showPaddleCheckout && (
              <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 mb-6">
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                  Payment
                </h2>
                <div
                  id="paddle-checkout-container"
                  className="min-h-[450px]"
                />
                {!checkoutReady && (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
                  </div>
                )}
              </div>
            )}

            {/* Message for hardcover when shipping not selected */}
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
            <OrderSummary
              store={store}
              selectedShipping={selectedShipping}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
