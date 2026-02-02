'use client'

import { ShoppingBag, Lock, Book, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CheckoutData } from '@/lib/checkout-store'
import type { ShippingOption } from '@/app/checkout/page'

interface OrderSummaryProps {
  store: CheckoutData
  selectedShipping: ShippingOption | null
  isSubmitting: boolean
  canPlaceOrder: boolean
  onPlaceOrder: () => void
}

export function OrderSummary ({
  store,
  selectedShipping,
  isSubmitting,
  canPlaceOrder,
  onPlaceOrder
}: OrderSummaryProps) {
  const isHardcover = store.outputType === 'LULU_BOOK'
  const bookPrice = isHardcover ? store.bookPrice : 14.99
  const shippingCost = isHardcover ? (selectedShipping?.shipping_cost || 0) : 0
  const subtotal = bookPrice + shippingCost

  return (
    <div className="sticky top-24 rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-zinc-100 bg-zinc-50/50 px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <ShoppingBag className="h-5 w-5 text-emerald-600" />
          Order Summary
        </h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Product */}
        <div className="flex gap-4">
          {/* Book preview image */}
          <div className="relative h-20 w-20 shrink-0 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center overflow-hidden">
            {store.imagePreviewUrl ? (
              <img
                src={store.imagePreviewUrl}
                alt="Your photo"
                className="h-full w-full object-cover"
              />
            ) : isHardcover ? (
              <Book className="h-8 w-8 text-emerald-400" />
            ) : (
              <Sparkles className="h-8 w-8 text-violet-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-zinc-900 truncate">
              Personalized Storybook
            </h3>
            <p className="text-sm text-zinc-500 mt-0.5">
              {isHardcover
                ? 'Premium Hardcover · 8.5×8.5"'
                : 'Digital Book · Interactive HTML'}
            </p>
            <p className="text-sm text-zinc-500 mt-0.5 truncate">
              Featuring: {store.name}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-100" />

        {/* Price breakdown */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-600">
              {isHardcover ? 'Hardcover Book' : 'Digital Book'}
            </span>
            <span className="font-medium text-zinc-900">${bookPrice.toFixed(2)}</span>
          </div>
          {isHardcover && (
            <div className="flex justify-between">
              <span className="text-zinc-600">Shipping</span>
              {selectedShipping ? (
                <span className="font-medium text-zinc-900">${shippingCost.toFixed(2)}</span>
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </div>
          )}
          <div className="flex justify-between text-zinc-500">
            <span>Tax</span>
            <span>Calculated at payment</span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-200" />

        {/* Total */}
        <div className="flex justify-between items-baseline">
          <span className="text-base font-semibold text-zinc-900">Subtotal</span>
          <span className="text-xl font-bold text-emerald-600">
            ${subtotal.toFixed(2)}
          </span>
        </div>

        <Button
          onClick={onPlaceOrder}
          disabled={!canPlaceOrder || isSubmitting}
          className="w-full h-12 text-base font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:shadow-none"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Processing...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Place Order
            </span>
          )}
        </Button>

        {!canPlaceOrder && !isSubmitting && (
          <p className="text-xs text-center text-zinc-500">
            {isHardcover
              ? (selectedShipping ? 'Complete your address to continue' : 'Select a delivery option to continue')
              : 'Upload a photo to continue'}
          </p>
        )}

        {/* Security note */}
        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-zinc-400">
          <Lock className="h-3.5 w-3.5" />
          <span>Secure checkout powered by Paddle</span>
        </div>
      </div>
    </div>
  )
}
