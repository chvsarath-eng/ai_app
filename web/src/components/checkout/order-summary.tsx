'use client'

import { ShoppingBag, Lock, Book, Sparkles, CheckCircle } from 'lucide-react'
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
    <div className="sticky top-24 rounded-2xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-zinc-50 to-zinc-100 border-b border-zinc-200 px-5 py-4 sm:px-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <ShoppingBag className="h-5 w-5 text-emerald-600" />
          Order Summary
        </h2>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {/* Product Card */}
        <div className="flex gap-4 items-start">
          {/* Book preview image */}
          <div className="relative h-20 w-20 shrink-0 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center overflow-hidden shadow-sm ring-1 ring-zinc-200/50">
            {store.imagePreviewUrl ? (
              <img
                src={store.imagePreviewUrl}
                alt="Your photo"
                className="h-full w-full object-cover"
              />
            ) : isHardcover ? (
              <Book className="h-8 w-8 text-emerald-500" />
            ) : (
              <Sparkles className="h-8 w-8 text-violet-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-zinc-900 leading-tight">
              Personalized Storybook
            </h3>
            <p className="text-sm text-zinc-500 mt-1">
              {isHardcover
                ? 'Premium Hardcover · 8.5×8.5"'
                : 'Digital Book · Interactive HTML'}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <p className="text-sm text-zinc-600 truncate">
                Featuring: <span className="font-medium">{store.name}</span>
              </p>
            </div>
          </div>
        </div>

        {/* What's included */}
        <div className="rounded-xl bg-zinc-50 p-4 space-y-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">What's included</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-zinc-700">
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>{isHardcover ? '24-page premium hardcover book' : 'Interactive digital flipbook'}</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-700">
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>AI-generated 4K illustrations</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-700">
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>Personalized story with {store.name}</span>
            </div>
            {!isHardcover && (
              <div className="flex items-center gap-2 text-zinc-700">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Instant email delivery</span>
              </div>
            )}
          </div>
        </div>

        {/* Price breakdown */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-zinc-600">
              {isHardcover ? 'Hardcover Book' : 'Digital Book'}
            </span>
            <span className="font-semibold text-zinc-900">${bookPrice.toFixed(2)}</span>
          </div>
          {isHardcover && (
            <div className="flex justify-between items-center">
              <span className="text-zinc-600">Shipping</span>
              {selectedShipping ? (
                <span className="font-semibold text-zinc-900">${shippingCost.toFixed(2)}</span>
              ) : (
                <span className="text-zinc-400 italic">Select delivery</span>
              )}
            </div>
          )}
          <div className="flex justify-between items-center text-zinc-500">
            <span>Tax</span>
            <span className="text-xs">Calculated at payment</span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-200" />

        {/* Total */}
        <div className="flex justify-between items-baseline">
          <span className="text-base font-semibold text-zinc-900">Subtotal</span>
          <div className="text-right">
            <span className="text-2xl font-bold text-emerald-600">
              ${subtotal.toFixed(2)}
            </span>
            <p className="text-xs text-zinc-400 mt-0.5">+ tax</p>
          </div>
        </div>

        {/* Place Order Button */}
        <Button
          onClick={onPlaceOrder}
          disabled={!canPlaceOrder || isSubmitting}
          className="w-full h-12 text-base font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:shadow-none transition-all duration-200"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
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
            <span className="flex items-center justify-center gap-2">
              <Lock className="h-4 w-4" />
              Place Order
            </span>
          )}
        </Button>

        {/* Helper text */}
        {!canPlaceOrder && !isSubmitting && (
          <p className="text-xs text-center text-zinc-500">
            {isHardcover
              ? (selectedShipping ? 'Complete your address to continue' : 'Select a delivery option to continue')
              : 'Upload a photo to continue'}
          </p>
        )}

        {/* Security badges */}
        <div className="pt-3 border-t border-zinc-100">
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
            <Lock className="h-3.5 w-3.5" />
            <span>Secure checkout powered by Paddle</span>
          </div>
          <div className="flex items-center justify-center gap-3 mt-3">
            <svg className="h-6 w-auto text-zinc-300" viewBox="0 0 50 32" fill="currentColor">
              <rect width="50" height="32" rx="4" fill="currentColor" opacity="0.1"/>
              <text x="25" y="20" textAnchor="middle" fontSize="10" fill="currentColor">VISA</text>
            </svg>
            <svg className="h-6 w-auto text-zinc-300" viewBox="0 0 50 32" fill="currentColor">
              <rect width="50" height="32" rx="4" fill="currentColor" opacity="0.1"/>
              <circle cx="20" cy="16" r="8" fill="currentColor" opacity="0.3"/>
              <circle cx="30" cy="16" r="8" fill="currentColor" opacity="0.3"/>
            </svg>
            <svg className="h-6 w-auto text-zinc-300" viewBox="0 0 50 32" fill="currentColor">
              <rect width="50" height="32" rx="4" fill="currentColor" opacity="0.1"/>
              <text x="25" y="20" textAnchor="middle" fontSize="8" fill="currentColor">PayPal</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
