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

  const characterNames = store.characters.map((c) => c.name).filter(Boolean)
  const featuredNames = characterNames.length > 0
    ? characterNames.join(', ')
    : 'your characters'

  return (
    <div className="lg:sticky lg:top-20 rounded-xl border border-zinc-200 bg-white shadow-md overflow-hidden">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-zinc-50 to-zinc-100 border-b border-zinc-200 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
          <ShoppingBag className="h-4 w-4 text-emerald-600" />
          Order Summary
        </h2>
      </div>

      <div className="p-4 space-y-3">
        {/* Product Card */}
        <div className="flex gap-3 items-start">
          {/* Character preview thumbnails */}
          <div className="relative shrink-0">
            {store.imagePreviewUrls.length > 0 ? (
              <div className="flex -space-x-2">
                {store.imagePreviewUrls.slice(0, 4).map((url, i) => (
                  <div
                    key={i}
                    className="relative h-10 w-10 rounded-full overflow-hidden ring-2 ring-white shadow-sm"
                    style={{ zIndex: 4 - i }}
                  >
                    <img
                      src={url}
                      alt={store.characters[i]?.name || `Character ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-14 w-14 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center shadow-sm ring-1 ring-zinc-200/50">
                {isHardcover ? (
                  <Book className="h-6 w-6 text-emerald-500" />
                ) : (
                  <Sparkles className="h-6 w-6 text-violet-500" />
                )}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-zinc-900 leading-tight">
              Personalized Storybook
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isHardcover ? 'Hardcover · 8.5×8.5"' : 'Digital · HTML'}
              {store.characters.length > 1 && ` · ${store.characters.length} characters`}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <p className="text-xs text-zinc-600 truncate">
                Featuring: <span className="font-medium">{featuredNames}</span>
              </p>
            </div>
          </div>
        </div>

        {/* What's included */}
        <div className="rounded-lg bg-zinc-50 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">What's included</p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-700">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>{isHardcover ? 'Premium hardcover book' : 'Interactive digital flipbook'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-700">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>AI-generated 4K illustrations</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-700">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Personalized story with {featuredNames}</span>
            </div>
            {!isHardcover && (
              <div className="flex items-center gap-1.5 text-zinc-700">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Instant email delivery</span>
              </div>
            )}
          </div>
        </div>

        {/* Price breakdown */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-zinc-600">
              {isHardcover ? 'Hardcover' : 'Digital Book'}
            </span>
            <span className="font-semibold text-zinc-900">${bookPrice.toFixed(2)}</span>
          </div>
          {isHardcover && (
            <div className="flex justify-between items-center">
              <span className="text-zinc-600">Shipping</span>
              {selectedShipping ? (
                <span className="font-semibold text-zinc-900">${shippingCost.toFixed(2)}</span>
              ) : (
                <span className="text-zinc-400 text-xs italic">Select delivery</span>
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
          <span className="text-sm font-semibold text-zinc-900">Subtotal</span>
          <div className="text-right">
            <span className="text-lg font-bold text-emerald-600">
              ${subtotal.toFixed(2)}
            </span>
            <span className="text-xs text-zinc-400 ml-1">+ tax</span>
          </div>
        </div>

        {/* Place Order Button */}
        <Button
          onClick={onPlaceOrder}
          disabled={!canPlaceOrder || isSubmitting}
          className="h-10 w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-sm transition hover:shadow-md hover:brightness-105 disabled:opacity-50 disabled:shadow-none"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2 text-sm">
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
            <span className="flex items-center justify-center gap-2 text-sm">
              <Lock className="h-3.5 w-3.5" />
              Place Order
            </span>
          )}
        </Button>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400">
          <Lock className="h-3 w-3" />
          <span>Secure checkout powered by Paddle</span>
        </div>
      </div>
    </div>
  )
}
