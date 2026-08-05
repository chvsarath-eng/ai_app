'use client'

import { ShoppingBag, Lock, Book, Sparkles, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CheckoutData } from '@/lib/checkout-store'
import type { ShippingOption } from '@/app/checkout/page'

interface OrderSummaryProps {
  store: CheckoutData
  selectedShipping: ShippingOption | null
  isSubmitting: boolean
  isCheckoutOpen: boolean
  canPlaceOrder: boolean
  ctaLabel?: string
  submittingLabel?: string
  onPlaceOrder: () => void
}

export function OrderSummary ({
  store,
  selectedShipping,
  isSubmitting,
  isCheckoutOpen,
  canPlaceOrder,
  ctaLabel = 'Continue to Payment',
  submittingLabel = 'Processing...',
  onPlaceOrder
}: OrderSummaryProps) {
  const isHardcover = store.outputType === 'LULU_BOOK'
  const bookPrice = isHardcover ? store.bookPrice : 9.99
  const shippingCost = isHardcover ? (selectedShipping?.shipping_cost || 0) : 0
  const subtotal = bookPrice + shippingCost

  const characterNames = store.characters.map((c) => c.name).filter(Boolean)
  const featuredNames = characterNames.length > 0
    ? characterNames.join(', ')
    : 'your characters'

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
              <ShoppingBag className="h-4 w-4 text-violet-600" />
              Order Summary
            </h2>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              {store.imagePreviewUrls.length > 0 ? (
                <div className="flex -space-x-2">
                  {store.imagePreviewUrls.slice(0, 4).map((url, i) => (
                    <div
                      key={i}
                      className="relative h-10 w-10 overflow-hidden rounded-full ring-2 ring-white"
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
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white ring-1 ring-zinc-200">
                  {isHardcover ? (
                    <Book className="h-6 w-6 text-zinc-500" />
                  ) : (
                    <Sparkles className="h-6 w-6 text-violet-500" />
                  )}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold leading-tight text-zinc-900">
                Personalized Storybook
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {isHardcover ? 'Hardcover · 8.5×8.5"' : 'Digital · HTML'}
                {store.characters.length > 1 && ` · ${store.characters.length} characters`}
              </p>
              <div className="mt-1 flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                <p className="truncate text-xs text-zinc-600">
                  Featuring: <span className="font-medium">{featuredNames}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 rounded-2xl bg-zinc-50 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What&apos;s included</p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-700">
              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-violet-500" />
              <span>{isHardcover ? 'Premium hardcover book' : 'Interactive digital flipbook'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-700">
              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-violet-500" />
              <span>AI-generated 4K illustrations</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-700">
              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-violet-500" />
              <span>Personalized story with {featuredNames}</span>
            </div>
            {!isHardcover && (
              <div className="flex items-center gap-1.5 text-zinc-700">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                <span>Instant email delivery</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white/90 p-4 text-sm shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">
              {isHardcover ? 'Hardcover' : 'Digital Book'}
            </span>
            <span className="font-semibold text-zinc-900">${bookPrice.toFixed(2)}</span>
          </div>
          {isHardcover && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-zinc-600">Shipping</span>
              {selectedShipping ? (
                <span className="font-semibold text-zinc-900">${shippingCost.toFixed(2)}</span>
              ) : (
                <span className="text-zinc-400 text-xs italic">Select delivery</span>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-zinc-500">
            <span>Tax</span>
            <span className="text-xs">Calculated at payment</span>
          </div>
          <div className="mt-3 border-t border-zinc-200/80 pt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-zinc-900">Subtotal</span>
              <div className="text-right">
                <span className="text-lg font-bold text-zinc-900">
                  ${subtotal.toFixed(2)}
                </span>
                <span className="ml-1 text-xs text-zinc-400">+ tax</span>
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={onPlaceOrder}
          disabled={!canPlaceOrder || isSubmitting || isCheckoutOpen}
          className="h-11 w-full bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-50"
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
              {submittingLabel}
            </span>
          ) : isCheckoutOpen ? (
            <span className="flex items-center justify-center gap-2 text-sm">
              <Lock className="h-3.5 w-3.5" />
              Payment Window Open
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2 text-sm">
              <Lock className="h-3.5 w-3.5" />
              {ctaLabel}
            </span>
          )}
        </Button>
      </div>
    </div>
  )
}
